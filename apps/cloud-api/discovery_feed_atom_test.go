package main

import (
	"errors"
	"strings"
	"testing"
)

func TestDecodeDiscoveryFeedRejectsAtomFixture(t *testing.T) {
	_, err := decodeDiscoveryFeedXML(
		strings.NewReader(readDiscoveryFeedFixture(t, "atom_shkspr.xml")),
		discoveryBodyLimit,
	)
	if err == nil {
		t.Fatalf("decodeDiscoveryFeedXML should reject Atom fixture")
	}
	if !errors.Is(err, errDiscoveryXMLDecode) {
		t.Fatalf("error = %v, want errDiscoveryXMLDecode", err)
	}
}
