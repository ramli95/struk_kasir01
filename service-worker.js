/**
 * ====================================================================
 * SERVICE WORKER - CLOUD POS KASIR
 * ====================================================================
 * Fungsi: menyimpan (cache) file aplikasi & library yang dipakai supaya
 * aplikasi tetap bisa DIBUKA dan DIPAKAI walau tidak ada koneksi internet.
 *
 * PENTING: request ke Google Apps Script (data toko/produk/transaksi)
 * SENGAJA tidak di-cache di sini - itu harus selalu data terbaru saat
 * online. Saat offline, transaksi baru otomatis masuk ANTRIAN di sisi
 * aplikasi (lihat index.html) dan baru dikirim saat koneksi kembali.
 *
 * Kalau nanti ada revisi besar pada index.html, naikkan CACHE_VERSION
 * di bawah supaya pengguna lama otomatis mendapat versi baru.
 * ====================================================================
 */

const CACHE_VERSION = 'kasir-pos-v1';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js',
    'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ========================================================================
// INSTALL: simpan app shell + library ke cache
// ========================================================================
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            return Promise.all([
                cache.addAll(APP_SHELL),
                // CDN pakai request mode 'no-cors' jaga-jaga kalau ada CDN yg tak kirim header CORS lengkap
                ...CDN_ASSETS.map((url) =>
                    fetch(url, { mode: 'no-cors' })
                        .then((res) => cache.put(url, res))
                        .catch(() => null) // kalau satu CDN gagal di-cache saat install, jangan gagalkan semua
                )
            ]);
        })
    );
});

// ========================================================================
// ACTIVATE: bersihkan cache versi lama
// ========================================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ========================================================================
// FETCH: strategi cache-first utk app shell & library, network-only utk API
// ========================================================================
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Jangan pernah cache panggilan ke Google Apps Script - itu harus selalu data live
    if (url.indexOf('script.google.com') !== -1 || url.indexOf('script.googleusercontent.com') !== -1) {
        return; // biarkan request jalan normal ke network, tidak diintersep
    }

    // Hanya tangani GET (POST ke API dibiarkan lewat langsung)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                // Cache-first: langsung kasih versi tersimpan, sambil diam-diam update cache di background
                fetch(event.request).then((res) => {
                    if (res && res.status === 200) {
                        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, res));
                    }
                }).catch(() => null);
                return cached;
            }

            // Belum ada di cache -> coba network, simpan hasilnya utk kunjungan berikutnya
            return fetch(event.request).then((res) => {
                if (res && res.status === 200 && res.type !== 'opaqueredirect') {
                    const resClone = res.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
                }
                return res;
            }).catch(() => {
                // Offline & tidak ada di cache -> kalau ini navigasi halaman, tampilkan index.html dari cache sbg fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return new Response('', { status: 408, statusText: 'Offline dan tidak ada di cache' });
            });
        })
    );
});
