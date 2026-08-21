# PENTING: cek .gitignore kamu di repo GitHub

.gitignore lama (dari setup awal) isinya termasuk baris ini:
```
*.keystore
*.jks
```

Ini sengaja dulu buat nge-exclude signing key PRODUKSI (kalau nanti publish
ke Play Store) dari git — signing key produksi memang harus dirahasiakan.

TAPI file baru `keystore/debug.keystore` ini BEDA KONTEKS: ini cuma debug
keystore (bukan signing key produksi), dan justru HARUS di-commit supaya CI
selalu pakai key yang sama di setiap build (baca alasannya di komentar
workflow). Kalau dibiarkan, baris `*.keystore` di atas bakal nge-ignore file
ini juga secara diam-diam.

## Yang perlu kamu lakukan

Buka file `.gitignore` di repo, ganti baris:
```
*.keystore
*.jks
```

Jadi:
```
*.keystore
!keystore/debug.keystore
*.jks
```

Tanda `!` di depan artinya "kecualikan dari ignore rule di atasnya" — jadi
semua file `.keystore` lain (termasuk nanti kalau kamu bikin signing key
produksi) tetap ke-ignore seperti biasa, KECUALI file debug ini secara
spesifik.

Setelah itu, commit `keystore/debug.keystore` seperti file biasa.
