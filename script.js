// ===============================================
// 1. URL WEB APP APPS SCRIPT (BERAKHIRAN /exec)
// ===============================================
const SCRIPT_URL_SIMPAN = "https://script.google.com/macros/s/AKfycbzJo9BoqVnoNO9ddaj1nbHHb0Xo6bF80o7k3piGT50laI4_wC7QHv1wTk7iqBW9KNFw/exec";

// ===============================================
// 2. URL CSV MASTER DATA (BERAKHIRAN output=csv)
// ===============================================
const URL_MASTER_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRXvQwzAcegLkM99evCsAN10ms8GWBMmteCax4aUSVaPoPpHWt8L3UcI6PSb6lbTuAPynVj2QVzy8c-/pub?gid=0&single=true&output=csv";

let semuaJobAbnormal = [];
let semuaRiwayat = [];
let globalJobCounter = 0;

function previewImage(event) {
    var reader = new FileReader();
    reader.onload = function() {
        var output = document.getElementById('preview');
        output.src = reader.result;
        output.style.display = 'block';
    }
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    }
}

function logDebug(pesan) {
    console.log(pesan);
}

// ===============================================
// FUNGSI MENGIRIM DATA PENGERJAAN KE APPS SCRIPT
// ===============================================
async function simpanDataPengerjaan() {
    const teknisi = document.getElementById('inputTeknisi').value.trim();
    const tindakan = document.getElementById('inputTindakan').value.trim();
    
    // MENGAMBIL ID UNIK DARI HIDDEN FIELD (Sudah bersih/decoded)
    const idUnikJob = document.getElementById('hiddenJobName').value.trim(); 
    
    const line = document.getElementById('hiddenLine').value.trim();
    const idCard = document.getElementById('hiddenIdCard').value;
    const judulJobUI = document.getElementById('judulModalForm').getAttribute('data-namamurni') || document.getElementById('judulModalForm').innerText; 

    if(!teknisi || !tindakan) {
        alert("Mohon isi Nama Teknisi dan Tindakan Perbaikan!");
        return;
    }

    const btnSimpan = document.getElementById('btnSimpan');
    btnSimpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    btnSimpan.disabled = true;

    const fotoInput = document.getElementById('fotoBukti');
    let base64String = "";
    if(fotoInput.files.length > 0) {
        base64String = document.getElementById('preview').src; 
    }

    // PAYLOAD MENGIRIM idUnik DAN namaJob MURNI
    const payload = {
        idUnik: idUnikJob, // Kunci utama pencarian di Kolom A
        line: line,
        namaJob: judulJobUI, // Nama job asli tanpa embel-embel "Line XX - "
        teknisi: teknisi,
        tindakan: tindakan,
        fotoBase64: base64String
    };

    try {
        const response = await fetch(SCRIPT_URL_SIMPAN, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === "sukses") {
            alert("Berhasil! Job selesai dan tersimpan ke Sheet.");
            
            // 1. Tambahkan ke Riwayat Selesai (Memori)
            let waktuSekarang = new Date().toLocaleString('id-ID'); 
            semuaRiwayat.push({
                waktu: waktuSekarang,
                line: line,
                namaJob: judulJobUI,
                teknisi: teknisi,
                tindakan: tindakan,
                linkFoto: result.fileUrl || (base64String ? "Tersimpan di Google Drive" : "Tidak ada")
            });
            renderRiwayatUI(); 

            // 2. Hapus Job dari memori Job Aktif BERDASARKAN ID UNIK
            semuaJobAbnormal = semuaJobAbnormal.filter(j => j.idUnik.trim() !== idUnikJob);
            
            // 3. REFRESH TAMPILAN JOB AKTIF AGAR KARTUNYA HILANG
            terapkanFilterLine(); 

            // 4. Tutup Popup Modal
            var myModalEl = document.getElementById('modalKerjakan');
            var modal = bootstrap.Modal.getInstance(myModalEl);
            modal.hide();
            
            // 5. Bersihkan Form Input
            document.getElementById('formPengerjaan').reset();
            document.getElementById('preview').style.display = 'none';
            document.getElementById('preview').src = '';
        } else {
            alert("Gagal menyimpan: " + result.pesan);
        }
    } catch (error) {
        alert("Terjadi error koneksi ke Google. Pesan: " + error.message);
    } finally {
        btnSimpan.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Simpan Selesai';
        btnSimpan.disabled = false;
    }
}

// ===============================================
// FUNGSI TUNGGAL LOAD SEMUA DATA DARI MASTER CSV
// ===============================================
async function loadSemuaData() {
    document.getElementById('loading-indicator').style.display = 'block';
    
    try {
        // Tambahkan timestamp anti-cache agar CSV selalu menarik data paling baru
        const response = await fetch(URL_MASTER_CSV + "&t=" + new Date().getTime());
        if (!response.ok) throw new Error("Gagal mengambil data dari Master CSV");
        
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: false,
            skipEmptyLines: true,
            complete: function(results) {
                const data = results.data;
                semuaJobAbnormal = [];
                semuaRiwayat = [];
                
                for (let baris = 1; baris < data.length; baris++) {
                    let values = data[baris];
                    if(values.length < 11) continue; 
                    
                    let idUnikMaster = (values[0] || "").trim(); // AMBIL ID UNIK DARI KOLOM A
                    if (idUnikMaster === "") continue;

                    let statusJob = (values[10] || "").trim(); // Kolom K: Status
                    let namaJobLengkap = values[5] || "-";     // Kolom F: Nama Job
                    let tipeJob = namaJobLengkap.includes("Temuan Lain") ? "Temuan Lain" : "Aktivitas";

                    if (statusJob === "Belum Dikerjakan") {
                        semuaJobAbnormal.push({
                            idUnik: idUnikMaster, // SIMPAN ID UNIK
                            tipe: tipeJob,
                            tanggal: values[1] || "-",         
                            shift: values[2] || "-",           
                            line: values[3] || "-",            
                            pelapor: values[4] || "-",         
                            namaJob: namaJobLengkap,
                            cond: values[6] || "-",            
                            rep: values[7] || "-",             
                            ket: values[8] || "-",             
                            lamp: values[9] || ""              
                        });
                    } else if (statusJob === "Selesai") {
                        semuaRiwayat.push({
                            waktu: values[13] || "-",          
                            line: values[3] || "-",            
                            namaJob: namaJobLengkap,
                            teknisi: values[11] || "-",        
                            tindakan: values[12] || "-",       
                            linkFoto: values[14] || ""         
                        });
                    }
                }
                
                document.getElementById('loading-indicator').style.display = 'none';
                inisialisasiFilterLine();
                renderJobsUI();
                renderRiwayatUI();
            },
            error: function(err) { 
                console.log("Error Parsing:", err);
                document.getElementById('loading-indicator').style.display = 'none';
            }
        });
    } catch (error) {
        console.log("Gagal memuat Master Data:", error);
        document.getElementById('loading-indicator').style.display = 'none';
    }
}

// ===============================================
// INISIALISASI & TERAPKAN FILTER LINE
// ===============================================
function inisialisasiFilterLine() {
    const filterSelect = document.getElementById('filterLine');
    if (!filterSelect) return;

    filterSelect.innerHTML = '<option value="ALL">Tampilkan Semua Line</option>';

    let unikLines = new Set();
    semuaJobAbnormal.forEach(job => {
        if (job.line && job.line !== "-" && job.line.trim() !== "") {
            unikLines.add(job.line.toUpperCase().trim());
        }
    });

    let daftarLineUrut = Array.from(unikLines).sort();

    daftarLineUrut.forEach(line => {
        let opt = document.createElement('option');
        opt.value = line;
        opt.innerHTML = "Line: " + line;
        filterSelect.appendChild(opt);
    });
}

function terapkanFilterLine() {
    let pilihan = document.getElementById('filterLine').value;
    let dataTerfilter = [];

    if (pilihan === "ALL") {
        dataTerfilter = semuaJobAbnormal;
    } else {
        dataTerfilter = semuaJobAbnormal.filter(job => job.line.toUpperCase().trim() === pilihan);
    }
    
    renderJobsUI(dataTerfilter);
}

// ===============================================
// RENDER UI UNTUK TAB JOB AKTIF 
// ===============================================
function renderJobsUI(dataJobs = semuaJobAbnormal) {
    document.getElementById('count-job').innerText = dataJobs.length;
    const container = document.getElementById('job-container');
    container.innerHTML = ""; 

    if (dataJobs.length === 0) {
        container.innerHTML = `<div class="col-12"><div class="alert alert-success text-center"><i class="fas fa-check-circle me-2"></i>Tidak ada job abnormal di Line ini.</div></div>`;
        return;
    }

    dataJobs.forEach(job => {
        globalJobCounter++;
        let cardId = "jobCard-" + globalJobCounter;

        let linkLampiranHtml = job.lamp !== "" && job.lamp !== "-" ? `<a href="${job.lamp}" target="_blank" class="text-primary text-decoration-underline ms-1"><i class="fas fa-external-link-alt"></i> Buka File</a>` : "<span class='text-muted ms-1'>Tidak ada</span>";

        let kondisiHTML = job.tipe === "Temuan Lain" ? `<p class="mb-1 small">Status: <span class="badge bg-warning text-dark">${job.cond}</span></p>` : `<p class="mb-1 small">Kondisi: <span class="text-danger fw-bold">${job.cond}</span> | Replace: <span class="text-danger fw-bold">${job.rep}</span></p>`;

        let namaTampilUI = job.namaJob.replace(/"/g, '&quot;').replace(/\n/g, ' ');
        let safeLine = String(job.line).replace(/"/g, '&quot;').replace(/\n/g, ' ');
        let safeIdUnik = encodeURIComponent(job.idUnik); // Encode saat ditaruh di atribut HTML

        let cardHTML = `
            <div class="col-md-6 col-12" id="${cardId}">
                <div class="card card-job shadow-sm border-start-4 border-danger">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title text-primary fw-bold mb-0">
                                <i class="fas ${job.tipe === 'Temuan Lain' ? 'fa-exclamation-triangle text-warning' : 'fa-wrench'} me-1"></i> 
                                ${namaTampilUI}
                            </h6>
                            <span class="badge bg-danger badge-status">Menunggu</span>
                        </div>
                        <p class="text-muted mb-2" style="font-size: 0.8rem;">
                            <i class="fas fa-industry me-1"></i> Line: <strong class="text-dark">${job.line}</strong> | 
                            <i class="fas fa-calendar-alt ms-1 me-1"></i> ${job.tanggal} (Shift ${job.shift}) |
                            <i class="fas fa-user ms-1 me-1"></i> By: ${job.pelapor}
                        </p>
                        <div class="detail-box">
                            ${kondisiHTML}
                            <p class="mb-1 small"><strong>Keterangan:</strong> <br><span class="text-dark">${job.ket.replace(/\n/g, '<br>')}</span></p>
                            <p class="mb-0 small"><strong>Lampiran Pelapor:</strong> ${linkLampiranHtml}</p>
                        </div>
                        
                        <button class="btn btn-primary w-100 btn-sm" data-bs-toggle="modal" data-bs-target="#modalKerjakan" data-job="${safeIdUnik}" data-namauntukui="${namaTampilUI}" data-line="${safeLine}" data-cardid="${cardId}" onclick="siapkanForm(this)">
                            <i class="fas fa-tools me-1"></i> Kerjakan
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}

function siapkanForm(tombolDipencet) {
    // PENTING: Decode kembali ID Unik agar sama persis dengan teks di Kolom A Google Sheet!
    let idUnik = decodeURIComponent(tombolDipencet.getAttribute('data-job')); 
    let namaJobUI = tombolDipencet.getAttribute('data-namauntukui'); 
    let line = tombolDipencet.getAttribute('data-line');
    let idCard = tombolDipencet.getAttribute('data-cardid');

    document.getElementById('hiddenJobName').value = idUnik; 
    document.getElementById('hiddenLine').value = line;
    document.getElementById('hiddenIdCard').value = idCard;
    
    let elJudul = document.getElementById('judulModalForm');
    elJudul.innerText = "Line " + line + " - " + namaJobUI;
    elJudul.setAttribute('data-namamurni', namaJobUI); // Simpan nama murni untuk tabel riwayat
}

// ===============================================
// RENDER UI UNTUK TAB RIWAYAT SELESAI
// ===============================================
function renderRiwayatUI() {
    const container = document.getElementById('pills-done');
    
    if (semuaRiwayat.length === 0) {
        container.innerHTML = `<div class="alert alert-info">Belum ada riwayat pekerjaan yang diselesaikan.</div>`;
        return;
    }

    let html = `<div class="table-responsive"><table class="table table-hover table-bordered mt-2 bg-white">
                    <thead class="table-dark">
                        <tr>
                            <th>Waktu Selesai</th>
                            <th>Line</th>
                            <th>Nama Job</th>
                            <th>Teknisi</th>
                            <th>Tindakan</th>
                            <th>Bukti Foto</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    let reversedRiwayat = [...semuaRiwayat].reverse();

    reversedRiwayat.forEach(item => {
        let fotoHtml = (item.linkFoto && item.linkFoto.includes("http")) 
            ? `<a href="${item.linkFoto}" target="_blank" class="btn btn-sm btn-info text-white"><i class="fas fa-image"></i> Lihat</a>` 
            : `<span class="text-muted small">${item.linkFoto || "Tidak ada"}</span>`;

        html += `<tr>
                    <td>${item.waktu}</td>
                    <td>${item.line}</td>
                    <td>${item.namaJob}</td>
                    <td>${item.teknisi}</td>
                    <td>${item.tindakan}</td>
                    <td>${fotoHtml}</td>
                 </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ===============================================
// PERINTAH SAAT WEBSITE PERTAMA KALI DIBUKA
// ===============================================
window.onload = () => { 
    loadSemuaData(); 
};
