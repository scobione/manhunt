# QR regression fixtures

These PNGs are cropped screenshots from isolated GitHub Actions matches. They
contain no production account, lobby, location or signing secret.

- `lobby-qr-pixel-rounding.png`: local `127.0.0.1:5174` invitation from CI run
  `40405820582`; reproduced a ZXing checksum failure at a 314-pixel mobile width.
- `capture-qr-pixel-rounding.png`: expired, server-signed capture token for a
  disposable local test match from run `40407986934`. The image must decode, but
  it must not authorize capture in another match or join a lobby. Scaling alone
  did not reliably decode this denser QR.

The browser tests exercise the actual upload scanner and strict validation.
Fresh, randomly generated QR images separately exercise successful join and
capture with the real isolated API; old fixtures never bypass authorization.
