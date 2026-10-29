package main

// Voting stamps: secret ballots. A member votes with a separate voting key, never their member key. A registrar
// stamps that key "a real member of grid X" with a blind RSA signature, so nobody can tell whose key it is.
// The host checks the stamp before it stores a voting key's stamp or ballots. The same rules are in the app
// (app/adapter-nostr.js, voting stamps) and the tests (tools/stamps.py).
//
//   message  "citizens-stamp/1|<quarter>|<grid>|<voting key>"
//   hash     MGF1-SHA256 of the message, as long as the registrar's modulus, mod n (full-domain hash)
//   exponent the first prime at or above 2^32 + (first 4 bytes of SHA-256("citizens-grid/1|<grid>") >> 1)
//   check    sig^exponent mod n == hash, with n from stampkeys/<registrar>_<quarter>

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"math/big"
	"regexp"
	"sync"
)

var quarterRe = regexp.MustCompile(`^\d{4}Q[1-4]$`)

var (
	expMu    sync.Mutex
	expCache = map[string]*big.Int{}
)

func gridExp(grid string) *big.Int {
	expMu.Lock()
	defer expMu.Unlock()
	if e, ok := expCache[grid]; ok {
		return e
	}
	h := sha256.Sum256([]byte("citizens-grid/1|" + grid))
	x := new(big.Int).Lsh(big.NewInt(1), 32)
	x.Add(x, big.NewInt(int64(binary.BigEndian.Uint32(h[:4])>>1)))
	if x.Bit(0) == 0 {
		x.Add(x, big.NewInt(1))
	}
	for !x.ProbablyPrime(20) {
		x.Add(x, big.NewInt(2))
	}
	expCache[grid] = x
	return x
}

func mgf1(seed []byte, n int) []byte {
	out := make([]byte, 0, n+32)
	var c [4]byte
	for i := uint32(0); len(out) < n; i++ {
		binary.BigEndian.PutUint32(c[:], i)
		h := sha256.Sum256(append(append([]byte{}, seed...), c[:]...))
		out = append(out, h[:]...)
	}
	return out[:n]
}

func fdh(msg string, n *big.Int) *big.Int {
	k := (n.BitLen() + 7) / 8
	h := new(big.Int).SetBytes(mgf1([]byte(msg), k))
	return h.Mod(h, n)
}

type stampDoc struct {
	Period string `json:"period"`
	Grid   string `json:"grid"`
	Reg    string `json:"reg"`
	Sig    string `json:"sig"`
}

// stampValid checks a voting key's stamp (stamps/<voting key>) against its registrar's key for that quarter.
func (s *Store) stampValid(e *Event) bool {
	var st stampDoc
	if json.Unmarshal([]byte(e.Content), &st) != nil || !quarterRe.MatchString(st.Period) || st.Grid == "" || !isHex(st.Reg, 64) {
		return false
	}
	ke := s.earliest("stampkeys/" + st.Reg + "_" + st.Period)
	if ke == nil || ke.PubKey != st.Reg {
		return false
	}
	var kd struct {
		N string `json:"n"`
	}
	if json.Unmarshal([]byte(ke.Content), &kd) != nil {
		return false
	}
	n, ok1 := new(big.Int).SetString(kd.N, 16)
	sig, ok2 := new(big.Int).SetString(st.Sig, 16)
	if !ok1 || !ok2 || n.Sign() <= 0 || sig.Sign() <= 0 || sig.Cmp(n) >= 0 {
		return false
	}
	got := new(big.Int).Exp(sig, gridExp(st.Grid), n)
	return got.Cmp(fdh("citizens-stamp/1|"+st.Period+"|"+st.Grid+"|"+e.PubKey, n)) == 0
}
