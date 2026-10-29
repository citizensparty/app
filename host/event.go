package main

// Nostr events (NIP-01): the exact serialization used for ids, signature checks and signing.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/schnorr"
)

const (
	KindDoc  = 30078 // NIP-78 app data, parameterized replaceable: one record per (author, d tag)
	KindAuth = 22242 // NIP-42 sign-in
)

type Event struct {
	ID        string     `json:"id"`
	PubKey    string     `json:"pubkey"`
	CreatedAt int64      `json:"created_at"`
	Kind      int        `json:"kind"`
	Tags      [][]string `json:"tags"`
	Content   string     `json:"content"`
	Sig       string     `json:"sig"`
}

func (e *Event) Tag(name string) string {
	for _, t := range e.Tags {
		if len(t) >= 2 && t[0] == name {
			return t[1]
		}
	}
	return ""
}

// D, C and Ms are the record's path (e.g. items/abc), its collection (items) and the millisecond tie-break.
func (e *Event) D() string { return e.Tag("d") }
func (e *Event) C() string { return e.Tag("c") }
func (e *Event) Ms() int64 {
	n, _ := strconv.ParseInt(e.Tag("ms"), 10, 64)
	return n
}

// jsonString escapes like JavaScript's JSON.stringify, which is what NIP-01 ids are computed over.
func jsonString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

func (e *Event) Serialize() string {
	var b strings.Builder
	b.WriteString(`[0,`)
	jsonString(&b, e.PubKey)
	b.WriteString("," + strconv.FormatInt(e.CreatedAt, 10) + "," + strconv.Itoa(e.Kind) + ",[")
	for i, t := range e.Tags {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('[')
		for j, s := range t {
			if j > 0 {
				b.WriteByte(',')
			}
			jsonString(&b, s)
		}
		b.WriteByte(']')
	}
	b.WriteString("],")
	jsonString(&b, e.Content)
	b.WriteByte(']')
	return b.String()
}

func (e *Event) JSON() []byte {
	j, _ := json.Marshal(e)
	return j
}

func isHex(s string, n int) bool {
	if len(s) != n {
		return false
	}
	for _, c := range s {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

// Valid checks the id and the signature.
func (e *Event) Valid() bool {
	if !isHex(e.ID, 64) || !isHex(e.PubKey, 64) || !isHex(e.Sig, 128) {
		return false
	}
	h := sha256.Sum256([]byte(e.Serialize()))
	if hex.EncodeToString(h[:]) != e.ID {
		return false
	}
	pkb, _ := hex.DecodeString(e.PubKey)
	sigb, _ := hex.DecodeString(e.Sig)
	pk, err := schnorr.ParsePubKey(pkb)
	if err != nil {
		return false
	}
	sig, err := schnorr.ParseSignature(sigb)
	if err != nil {
		return false
	}
	return sig.Verify(h[:], pk)
}

type Key struct {
	priv *btcec.PrivateKey
	Pub  string
}

func NewKey(secretHex string) (*Key, error) {
	b, err := hex.DecodeString(strings.TrimSpace(secretHex))
	if err != nil || len(b) != 32 {
		return nil, fmt.Errorf("a key must be 64 hex characters")
	}
	priv, _ := btcec.PrivKeyFromBytes(b)
	return &Key{priv: priv, Pub: hex.EncodeToString(schnorr.SerializePubKey(priv.PubKey()))}, nil
}

func RandomSecret() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (k *Key) Sign(kind int, tags [][]string, content string) *Event {
	if tags == nil {
		tags = [][]string{}
	}
	e := &Event{PubKey: k.Pub, CreatedAt: time.Now().Unix(), Kind: kind, Tags: tags, Content: content}
	h := sha256.Sum256([]byte(e.Serialize()))
	e.ID = hex.EncodeToString(h[:])
	sig, err := schnorr.Sign(k.priv, h[:])
	if err == nil {
		e.Sig = hex.EncodeToString(sig.Serialize())
	}
	return e
}

// newer reports whether a should replace b: later created_at, then later ms, then the lower id (NIP-01).
func newer(a, b *Event) bool {
	if a.CreatedAt != b.CreatedAt {
		return a.CreatedAt > b.CreatedAt
	}
	if a.Ms() != b.Ms() {
		return a.Ms() > b.Ms()
	}
	return a.ID < b.ID
}
