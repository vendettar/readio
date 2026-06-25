package asr

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

func relayAudioUploadFileName(audioMimeType string) string {
	lowerMime := strings.ToLower(audioMimeType)
	switch {
	case strings.Contains(lowerMime, "wav"):
		return "input.wav"
	case strings.Contains(lowerMime, "mp4"), strings.Contains(lowerMime, "m4a"), strings.Contains(lowerMime, "x-m4a"):
		return "input.m4a"
	case strings.Contains(lowerMime, "webm"):
		return "input.webm"
	case strings.Contains(lowerMime, "ogg"):
		return "input.ogg"
	case strings.Contains(lowerMime, "flac"):
		return "input.flac"
	case strings.Contains(lowerMime, "aac"):
		return "input.aac"
	default:
		return "input.mp3"
	}
}

func (s *asrRelayService) decodeMultipartRelayPayload(
	w http.ResponseWriter,
	r *http.Request,
) (*asrRelayRequestPayload, *asrRelayErrorPayload) {
	ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if ct == "" || !strings.HasPrefix(ct, "multipart/form-data") {
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "ASR_INVALID_PAYLOAD",
			Message: "content-type must be multipart/form-data",
		}
	}

	const memoryLimit = 2 << 20
	r.Body = http.MaxBytesReader(w, r.Body, s.bodyLimit)
	if err := r.ParseMultipartForm(memoryLimit); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return nil, &asrRelayErrorPayload{
				Status:  http.StatusRequestEntityTooLarge,
				Code:    "ASR_PAYLOAD_TOO_LARGE",
				Message: "relay request body too large",
			}
		}
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "ASR_INVALID_PAYLOAD",
			Message: "invalid relay request payload",
		}
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "ASR_INVALID_PAYLOAD",
			Message: "missing audio payload",
		}
	}
	if header.Size <= 0 {
		_ = file.Close()
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, ErrASRInvalidAudio
	}

	reader := &asrMultipartReadCloser{
		File: file,
		form: r.MultipartForm,
	}

	return &asrRelayRequestPayload{
		Provider:      r.FormValue("provider"),
		Model:         r.FormValue("model"),
		APIKey:        r.FormValue("apiKey"),
		AudioReader:   reader,
		AudioSize:     header.Size,
		AudioMimeType: r.FormValue("audioMimeType"),
	}, nil
}

type asrMultipartReadCloser struct {
	multipart.File
	form *multipart.Form
}

func (m *asrMultipartReadCloser) Close() error {
	fileErr := m.File.Close()
	var formErr error
	if m.form != nil {
		formErr = m.form.RemoveAll()
	}
	if fileErr != nil {
		return fileErr
	}
	return formErr
}

func decodeStrictJSON[T any](body []byte, out *T) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return err
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); err != io.EOF {
		return err
	}
	return nil
}
