// backend/models/Profile.js
// small helper to normalize / sanitize profile objects sent to frontend
module.exports = {
  normalize(doc = {}, role = '') {
    if (!doc || typeof doc !== 'object') return doc;
    const out = Object.assign({}, doc);

    // ensure id fields present as strings
    if (out._id) out.id = String(out._id);

    // photoUrl (if not set) - useful for clients
    if (out.photo && !out.photoUrl) out.photoUrl = `/uploads/${out.photo}`;

    // normalize arrays
    if (role === 'teacher') {
      out.classIds = Array.isArray(out.classIds) ? out.classIds : (out.classIds ? [out.classIds] : []);
      out.subjectIds = Array.isArray(out.subjectIds) ? out.subjectIds : (out.subjectIds ? [out.subjectIds] : []);
    } else if (role === 'student') {
      // ensure classId is object-ish or null
      out.classId = out.classId || null;
    }

    out.role = role || out.role || '';
    return out;
  }
};
