/* Подменяет значок и сведения в готовом .exe без Wine, используя чисто JS-библиотеку resedit */
const fs = require('fs');

module.exports = function setIcon(exePath, icoPath, version = '1.0.0') {
  const ResEdit = require('resedit');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);

  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const group = groups[0] || { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, ico.icons.map((i) => i.data));

  const infos = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (infos.length) {
    const vi = infos[0];
    const [a, b, c] = version.split('.').map(Number);
    vi.setFileVersion(a || 1, b || 0, c || 0, 0, 1033);
    vi.setProductVersion(a || 1, b || 0, c || 0, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      ProductName: 'Мои уроки', FileDescription: 'Мои уроки — планер репетитора', InternalName: 'MoiUroki',
      OriginalFilename: 'MoiUroki.exe', CompanyName: 'Мои уроки', LegalCopyright: '', FileVersion: version, ProductVersion: version,
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • значок и сведения exe обновлены');
};
