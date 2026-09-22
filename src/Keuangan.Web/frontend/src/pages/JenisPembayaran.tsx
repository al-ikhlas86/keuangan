import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { TableActions } from '../components/TableActions';
import {
  createFeeType, updateFeeType, fetchFeeTypes, fetchFeeTypeRates, createFeeTypeRate, ApiError,
  type FeeTypeDto, type FeeKategori, type FeeFrekuensi, type FeeTypeRateDto,
} from '../api';
import { fmt } from '../lib/format';

// Tarif per angkatan (FeeTypeRate) - HANYA relevan utk FeeType kategori Wajib
// dgn usesAngkatanRate aktif. Backend Fase 1 (FeeTypesEndpoints.cs) belum
// punya endpoint HAPUS tarif - baris lama tidak pernah diedit/dihapus by
// design (lihat catatan di Entities/FeeType.cs), cuma tambah baris baru.
function FeeTypeRatesPanel({ feeTypeId }: { feeTypeId: number }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [rates, setRates] = useState<FeeTypeRateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [angkatan, setAngkatan] = useState('');
  const [berlakuMulai, setBerlakuMulai] = useState('');
  const [nominal, setNominal] = useState(0);

  async function load() {
    setLoading(true);
    try {
      setRates(await fetchFeeTypeRates(feeTypeId));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [feeTypeId]);

  async function tambah() {
    if (!angkatan.trim() || !berlakuMulai || nominal <= 0) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    try {
      await createFeeTypeRate(feeTypeId, { angkatan: angkatan.trim(), berlakuMulai: `${berlakuMulai}-01`, nominal });
      setAngkatan(''); setBerlakuMulai(''); setNominal(0);
      await load();
      showToast(tt('msg.berhasil'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan tarif angkatan.', 'error');
    }
  }

  return (
    <div className="md:col-span-2 p-3 rounded-lg border border-dashed border-gray-700/50">
      <p className="text-xs font-semibold text-gray-300 mb-1">{tt('heading.tarifPerAngkatan')}</p>
      {loading ? <p className="text-[10px] text-gray-400">Memuat...</p> : (
        <div className="space-y-1 mb-3">
          {rates.length ? rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-dark-900/60 rounded-lg px-3 py-2 text-[10px]">
              <div><span className="text-white font-medium">{r.angkatan}</span> <span className="text-gray-400">- {tt('label.berlakuMulai')} {r.berlakuMulai}</span></div>
              <span className="text-brand-400 font-semibold">{fmt(r.nominal)}</span>
            </div>
          )) : <p className="text-[10px] text-gray-400">{tt('misc.belumAdaTarif')}</p>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <input type="text" value={angkatan} onChange={(e) => setAngkatan(e.target.value)} placeholder={tt('placeholder.contohAngkatan')} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-brand-500" />
        <input type="month" value={berlakuMulai} onChange={(e) => setBerlakuMulai(e.target.value)} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-brand-500" />
        <input type="number" value={nominal || ''} onChange={(e) => setNominal(parseInt(e.target.value) || 0)} placeholder={tt('col.nominalDefault')} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-brand-500" />
      </div>
      <button type="button" onClick={tambah} className="mt-2 w-full py-1.5 rounded-lg bg-dark-900 border border-gray-700 text-gray-300 hover:bg-dark-850 text-[10px] font-medium"><Plus className="w-3 h-3 inline mr-1" />{tt('btn.tambahTarif')}</button>
    </div>
  );
}

function JenisForm({ editRecord, onDone }: { editRecord: FeeTypeDto | null; onDone: () => void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [nama, setNama] = useState(editRecord?.name || '');
  const [nominal, setNominal] = useState(editRecord?.defaultAmount ?? 500000);
  const [deskripsi, setDeskripsi] = useState(editRecord?.description || '');
  const [kategori, setKategori] = useState<FeeKategori>(editRecord?.kategori || 'Opsional');
  const [frekuensi, setFrekuensi] = useState<FeeFrekuensi>(editRecord?.frekuensi || 'Sekali');
  const [autoTagih, setAutoTagih] = useState(editRecord?.autoTagihSaatDaftar ?? false);
  const [usesAngkatanRate, setUsesAngkatanRate] = useState(editRecord?.usesAngkatanRate ?? false);
  const [cicilanJumlahBulan, setCicilanJumlahBulan] = useState(editRecord?.cicilanJumlahBulanDefault ?? 9);
  const [cicilanMinimal, setCicilanMinimal] = useState(editRecord?.cicilanMinimalPerBulan ?? 1000000);
  const [prioritas, setPrioritas] = useState(editRecord?.prioritas ?? 0);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const recordId = editRecord?.id || createdId;

  const isCicilan = frekuensi === 'Cicilan';
  const isAngkatanRateEligible = kategori === 'Wajib';

  async function simpan() {
    if (!nama.trim()) { showToast(tt('msg.namaDeskripsiHarusDiisi'), 'error'); return; }
    try {
      if (recordId) {
        await updateFeeType(recordId, { name: nama.trim(), description: deskripsi.trim(), defaultAmount: nominal, prioritas });
        showToast(`${tt('col.jenisPembayaran')} ${nama} ${tt('msg.berhasilDiperbarui')}`);
        onDone();
      } else {
        const res = await createFeeType({
          name: nama.trim(), description: deskripsi.trim(), defaultAmount: nominal || 500000,
          kategori, frekuensi, autoTagihSaatDaftar: kategori === 'Wajib' ? autoTagih : false,
          usesAngkatanRate: isAngkatanRateEligible ? usesAngkatanRate : false,
          cicilanJumlahBulanDefault: isCicilan ? cicilanJumlahBulan : 1,
          cicilanMinimalPerBulan: isCicilan ? cicilanMinimal : 0,
          prioritas,
        });
        showToast(`${tt('col.jenisPembayaran')} ${nama} ${tt('msg.berhasilDitambahkan')}`);
        if (isAngkatanRateEligible && usesAngkatanRate) {
          setCreatedId(res.id);
        } else {
          onDone();
        }
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan jenis pembayaran.', 'error');
    }
  }

  return (
    <div className="mt-4 bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-4">{editRecord ? tt('form.editJenisPembayaran') : tt('form.tambahJenisPembayaranBaru')}</h3>
      <form onSubmit={(e) => { e.preventDefault(); simpan(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('label.namaJenisPembayaran')} *</label>
          <input type="text" required value={nama} onChange={(e) => setNama(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('col.nominalDefault')} *</label>
          <input type="number" required value={nominal} onChange={(e) => setNominal(parseInt(e.target.value) || 0)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('label.prioritasAlokasi')}</label>
          <input type="number" value={prioritas} onChange={(e) => setPrioritas(parseInt(e.target.value) || 0)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('label.kategoriPembayaran')} *</label>
          <select value={kategori} disabled={!!editRecord} onChange={(e) => setKategori(e.target.value as FeeKategori)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-60">
            <option value="Opsional">{tt('kategori.opsional')}</option>
            <option value="Wajib">{tt('kategori.wajib')}</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('label.frekuensiPenagihan')} *</label>
          <select value={frekuensi} disabled={!!editRecord} onChange={(e) => setFrekuensi(e.target.value as FeeFrekuensi)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-60">
            <option value="Sekali">{tt('frekuensi.sekali')}</option>
            <option value="Bulanan">{tt('frekuensi.bulanan')}</option>
            <option value="Cicilan">{tt('frekuensi.cicilan')}</option>
          </select>
        </div>
        {isCicilan && !editRecord && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('label.cicilanJumlahBulan')} *</label>
              <input type="number" required min={1} value={cicilanJumlahBulan} onChange={(e) => setCicilanJumlahBulan(parseInt(e.target.value) || 1)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('label.cicilanMinimalPerBulan')} *</label>
              <input type="number" required min={0} value={cicilanMinimal} onChange={(e) => setCicilanMinimal(parseInt(e.target.value) || 0)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <label className="text-[10px] text-gray-500 block mb-1">{tt('col.deskripsi')}</label>
          <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={2} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
        </div>
        {kategori === 'Wajib' && !editRecord && (
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={autoTagih} onChange={(e) => setAutoTagih(e.target.checked)} />
              {tt('label.autoTagihSaatDaftar')}
            </label>
          </div>
        )}
        {isAngkatanRateEligible && !editRecord && (
          <div className="md:col-span-2 p-3 rounded-lg border border-dashed border-gray-700/50">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={usesAngkatanRate} onChange={(e) => setUsesAngkatanRate(e.target.checked)} />
              {tt('label.gunakanSppPerSiswa')}
            </label>
          </div>
        )}
        {recordId && isAngkatanRateEligible && usesAngkatanRate && <FeeTypeRatesPanel feeTypeId={recordId} />}
        <div className="md:col-span-2 flex gap-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Save className="w-3.5 h-3.5 inline mr-1" />{recordId ? tt('btn.update') : tt('btn.simpan')}</button>
          <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs hover:bg-dark-850">{createdId ? tt('btn.selesai') : tt('btn.batal')}</button>
        </div>
      </form>
    </div>
  );
}

// FeeType dibuat manual dari sini (BEDA dari Student yang read-only sinkron).
// Tidak ada hapus (FeeTypesEndpoints.cs cuma expose nonaktifkan via PATCH
// isActive=false) - jenis pembayaran yang pernah dipakai di Tagihan/Payment
// TIDAK BOLEH hilang begitu saja dari riwayat.
export function JenisPembayaran() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<FeeTypeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState<false | FeeTypeDto | 'new'>(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await fetchFeeTypes());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat jenis pembayaran.', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(f: FeeTypeDto) {
    try {
      await updateFeeType(f.id, { isActive: !f.isActive });
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengubah status.', 'error');
    }
  }

  function onFormDone() {
    setFormOpen(false);
    load();
  }

  return (
    <>
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-bold text-white">{tt('heading.kelolaJenisPembayaran')} ({items.length})</h3>
          <button onClick={() => setFormOpen('new')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium">
            <Plus className="w-3.5 h-3.5" />{tt('btn.tambah')} {tt('col.jenis')}
          </button>
        </div>
        {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                  <th className="pb-3">{tt('label.prioritasAlokasi')}</th>
                  <th className="pb-3">{tt('col.namaJenis')}</th>
                  <th className="pb-3">{tt('col.kategori')}</th>
                  <th className="pb-3">{tt('col.frekuensi')}</th>
                  <th className="pb-3 text-right">{tt('col.nominalDefault')}</th>
                  <th className="pb-3">{tt('col.status')}</th>
                  <th className="pb-3">{tt('col.aksi')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((j) => (
                  <tr key={j.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                    <td className="py-3 text-gray-400 text-center">{j.prioritas}</td>
                    <td className="py-3 font-medium text-white">{j.name}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${j.kategori === 'Wajib' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-300'}`}>
                        {j.kategori === 'Wajib' ? tt('kategori.wajib') : tt('kategori.opsional')}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${j.frekuensi === 'Bulanan' ? 'bg-brand-500/20 text-brand-400' : j.frekuensi === 'Cicilan' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-300'}`}>
                        {j.frekuensi === 'Bulanan' ? tt('frekuensi.bulanan') : j.frekuensi === 'Cicilan' ? tt('frekuensi.cicilan') : tt('frekuensi.sekali')}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {j.usesAngkatanRate ? <span className="text-[10px] text-gray-400">{tt('misc.nominalPerSiswa')}</span> : <span className="font-semibold text-brand-400">{fmt(j.defaultAmount)}</span>}
                    </td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${j.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>{j.isActive ? tt('status.aktif') : tt('status.nonaktif')}</span></td>
                    <td className="py-3"><TableActions onEdit={() => setFormOpen(j)} onDelete={() => toggleActive(j)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formOpen && <JenisForm editRecord={formOpen === 'new' ? null : formOpen} onDone={onFormDone} />}
    </>
  );
}
