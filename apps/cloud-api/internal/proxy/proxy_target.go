package proxy

import (
	"context"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
)

func validateTarget(target *url.URL) error {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "target host is required")
	}
	lowerHost := strings.ToLower(host)
	switch {
	case lowerHost == "localhost",
		strings.HasSuffix(lowerHost, ".localhost"),
		strings.HasSuffix(lowerHost, ".local"),
		lowerHost == "metadata",
		lowerHost == "metadata.google.internal":
		return NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		return nil
	}
	if isDisallowedAddr(addr) {
		return NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}
	return nil
}

func (p *Service) resolveTargetAddresses(ctx context.Context, target *url.URL) ([]netip.Addr, error) {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "target host is required")
	}
	if _, err := netip.ParseAddr(host); err == nil {
		addr, _ := netip.ParseAddr(host)
		if isDisallowedAddr(addr) {
			return nil, NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
		}
		return []netip.Addr{addr.Unmap()}, nil
	}

	lookup := net.DefaultResolver.LookupIPAddr
	if p != nil && p.lookupIP != nil {
		lookup = p.lookupIP
	}
	addresses, err := lookup(ctx, host)
	if err != nil || len(addresses) == 0 {
		return nil, NewError(http.StatusBadGateway, "PROXY_RESOLVE_FAILED", "unable to resolve target host")
	}

	allowed := make([]netip.Addr, 0, len(addresses))
	for _, addr := range addresses {
		ip, ok := netip.AddrFromSlice(addr.IP)
		if !ok || isDisallowedAddr(ip) {
			return nil, NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
		}
		allowed = append(allowed, ip.Unmap())
	}
	return allowed, nil
}

func isDisallowedAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsUnspecified() || addr.IsMulticast()
}

func (p *Service) newClient(addrs []netip.Addr) *http.Client {
	pinnedAddrs := append([]netip.Addr(nil), addrs...)
	var pinnedOnce sync.Mutex
	pinnedUsed := false

	transport := &http.Transport{
		DisableCompression: true,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}

			if contextAddrs, ok := pinnedAddrsFromContext(ctx); ok {
				return p.dialValidatedTargets(ctx, network, port, contextAddrs)
			}

			pinnedOnce.Lock()
			usePinned := !pinnedUsed && len(pinnedAddrs) > 0
			if usePinned {
				pinnedUsed = true
			}
			pinnedOnce.Unlock()

			if usePinned {
				return p.dialValidatedTargets(ctx, network, port, pinnedAddrs)
			}

			validatedAddrs, err := p.resolveTargetAddresses(ctx, &url.URL{Host: host})
			if err != nil {
				return nil, err
			}
			return p.dialValidatedTargets(ctx, network, port, validatedAddrs)
		},
	}

	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= MaxRedirects {
				return NewError(http.StatusBadGateway, "PROXY_REDIRECT_TOO_LONG", "redirect chain too long")
			}
			if err := validateTarget(req.URL); err != nil {
				return err
			}
			validatedAddrs, err := p.resolveTargetAddresses(req.Context(), req.URL)
			if err != nil {
				return err
			}
			*req = *req.WithContext(context.WithValue(req.Context(), redirectAddrsContextKey{}, validatedAddrs))
			if len(via) > 0 && len(via[0].Header) > 0 {
				copyRequestHeaders(req.Header, via[0].Header)
			}
			req.Header.Set("User-Agent", p.userAgent)
			return nil
		},
	}
	if p != nil && p.timeout > 0 {
		client.Timeout = p.timeout
	}
	return client
}

type redirectAddrsContextKey struct{}

func pinnedAddrsFromContext(ctx context.Context) ([]netip.Addr, bool) {
	addrs, ok := ctx.Value(redirectAddrsContextKey{}).([]netip.Addr)
	return addrs, ok && len(addrs) > 0
}

func copyRequestHeaders(dst http.Header, src http.Header) {
	dst.Del("Accept")
	dst.Del("Accept-Language")
	dst.Del("Cache-Control")
	dst.Del("If-Modified-Since")
	dst.Del("If-None-Match")
	dst.Del("If-Range")
	dst.Del("Pragma")
	dst.Del("Range")

	for _, headerName := range []string{
		"Accept",
		"Accept-Language",
		"Cache-Control",
		"If-Modified-Since",
		"If-None-Match",
		"If-Range",
		"Pragma",
		"Range",
	} {
		if value := strings.TrimSpace(src.Get(headerName)); value != "" {
			dst.Set(headerName, value)
		}
	}
}

func (p *Service) dialValidatedTargets(ctx context.Context, network, port string, addrs []netip.Addr) (net.Conn, error) {
	if len(addrs) == 0 {
		return nil, NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}
	for _, addr := range addrs {
		conn, err := p.dialTarget(ctx, network, net.JoinHostPort(addr.String(), port))
		if err == nil {
			return conn, nil
		}
	}
	return nil, NewError(http.StatusBadGateway, "PROXY_DIAL_FAILED", "unable to dial upstream")
}

func (p *Service) dialTarget(ctx context.Context, network, address string) (net.Conn, error) {
	if p != nil && p.dialContext != nil {
		return p.dialContext(ctx, network, address)
	}
	var d net.Dialer
	return d.DialContext(ctx, network, address)
}
