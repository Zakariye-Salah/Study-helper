// backend/routes/profile.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const auth = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');

let School = null;
try {
  School = require('../models/School');
} catch (e) {
  console.warn('models/School not found, using manager fallbacks');
}

function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}

function computeStatus(fee, paid) {
  fee = (typeof fee === 'undefined') ? 0 : fee;
  paid = (typeof paid === 'undefined') ? 0 : paid;
  if (fee === 0) return 'free';
  if (paid >= fee) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

/**
 * attachSchoolAndManager(profileObj, schoolId, createdBy)
 * (best-effort attachments)
 */
async function attachSchoolAndManager(profileObj, schoolId, createdBy) {
  try {
    if (!profileObj) return;

    if (schoolId && School) {
      try {
        const sc = await School.findById(String(schoolId)).select('name manager').lean().catch(()=>null);
        if (sc) {
          profileObj.school = { _id: String(sc._id), name: sc.name || null };
          if (sc.manager && isObjectIdString(String(sc.manager))) {
            const mgr = await User.findById(String(sc.manager)).select('fullname').lean().catch(()=>null);
            if (mgr) {
              profileObj.manager = { _id: String(mgr._id), fullname: mgr.fullname || null };
              if (!profileObj.school.name && mgr.fullname) profileObj.school.name = mgr.fullname;
              return;
            }
          }
        }
      } catch (e) {
        console.warn('attachSchoolAndManager: School query failed', e && e.message ? e.message : e);
      }
    }

    if (createdBy && isObjectIdString(String(createdBy))) {
      try {
        const by = await User.findById(String(createdBy)).select('fullname role schoolId').lean().catch(()=>null);
        if (by) {
          profileObj.manager = { _id: String(by._id), fullname: by.fullname || null };
          if (!profileObj.school) profileObj.school = {};
          if (!profileObj.school.name && by.fullname) profileObj.school.name = by.fullname;
          if ((!profileObj.school || !profileObj.school._id) && by.schoolId) {
            profileObj.school = profileObj.school || {};
            profileObj.school._id = String(by.schoolId);
          }
          return;
        }
      } catch (e) {
        console.warn('attachSchoolAndManager: createdBy lookup failed', e && e.message ? e.message : e);
      }
    }

    if (schoolId) {
      try {
        const mgrUser = await User.findOne({ schoolId: String(schoolId), role: 'manager' }).select('fullname').lean().catch(()=>null);
        if (mgrUser) {
          profileObj.manager = { _id: String(mgrUser._id), fullname: mgrUser.fullname || null };
          if (!profileObj.school) profileObj.school = {};
          if (!profileObj.school.name && mgrUser.fullname) profileObj.school.name = mgrUser.fullname;
          return;
        }
      } catch (e) {
        console.warn('attachSchoolAndManager: manager-by-school lookup failed', e && e.message ? e.message : e);
      }
    }

    try {
      const anyMgr = await User.findOne({ role: 'manager' }).select('fullname schoolId').lean().catch(()=>null);
      if (anyMgr) {
        profileObj.manager = { _id: String(anyMgr._id), fullname: anyMgr.fullname || null };
        if (!profileObj.school) profileObj.school = {};
        if (!profileObj.school.name && anyMgr.fullname) profileObj.school.name = anyMgr.fullname;
        if (!profileObj.school._id && anyMgr.schoolId) profileObj.school._id = String(anyMgr.schoolId);
        return;
      }
    } catch (e) {
      // swallow
    }

    if (!profileObj.school && schoolId) profileObj.school = { _id: String(schoolId) };

  } catch (err) {
    console.error('attachSchoolAndManager error', err && err.stack ? err.stack : err);
  }
}

/**
 * GET /api/profile
 * (unchanged behavior - returns profile based on role; parent sees child)
 */
router.get('/', auth, async (req, res) => {
  try {
    const me = req.user || null;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const normalizedRole = (me.role || '').toLowerCase();

    // Parent -> return child student
    if (normalizedRole === 'parent') {
      try {
        let childId = me.childId || me.child || me.child_id || null;
        if (!childId) {
          const parentId = me.id || me._id || null;
          if (parentId && isObjectIdString(String(parentId))) {
            const parentDoc = await Parent.findById(parentId).lean().catch(()=>null);
            if (parentDoc && parentDoc.childStudent) childId = String(parentDoc.childStudent);
          }
        }
        if (!childId || !isObjectIdString(String(childId))) {
          return res.status(404).json({ ok: false, message: 'Child student not found for this parent' });
        }

        const student = await Student.findById(String(childId)).populate('classId','name classId').lean().catch(()=>null);
        if (!student) return res.status(404).json({ ok: false, message: 'Child student not found' });

        student.paidAmount = student.paidAmount || 0;
        student.totalDue = (student.totalDue || student.fee || 0);
        student.status = student.status || computeStatus(student.fee, student.paidAmount);
        if (student.photo) student.photoUrl = `/uploads/${student.photo}`;

        await attachSchoolAndManager(student, student.schoolId, student.createdBy);

        return res.json({
          ok: true,
          profile: student,
          role: 'student',
          meta: { viewing: 'child', parentName: me.fullname || null, childNumberId: me.childNumberId || student.numberId || null }
        });
      } catch (err) {
        console.error('GET /profile (parent) error', err && (err.stack||err));
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
    }

    // Student -> own student record
    if (normalizedRole === 'student') {
      try {
        const id = me._id || me.id;
        if (!id || !isObjectIdString(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

        const student = await Student.findById(String(id)).populate('classId','name classId').lean().catch(()=>null);
        if (!student) return res.status(404).json({ ok: false, message: 'Student not found' });

        student.paidAmount = student.paidAmount || 0;
        student.totalDue = (student.totalDue || student.fee || 0);
        student.status = student.status || computeStatus(student.fee, student.paidAmount);
        if (student.photo) student.photoUrl = `/uploads/${student.photo}`;

        await attachSchoolAndManager(student, student.schoolId, student.createdBy);

        return res.json({ ok: true, profile: student, role: 'student' });
      } catch (err) {
        console.error('GET /profile (student) error', err && (err.stack||err));
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
    }

    // Teacher -> own teacher record
    if (normalizedRole === 'teacher') {
      try {
        const id = me._id || me.id;
        if (!id || !isObjectIdString(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

        const teacher = await Teacher.findById(String(id))
          .populate('classIds', 'name classId')
          .populate('subjectIds', 'name subjectId')
          .lean()
          .catch(()=>null);

        if (!teacher) return res.status(404).json({ ok: false, message: 'Teacher not found' });

        if (teacher.photo) teacher.photoUrl = `/uploads/${teacher.photo}`;

        await attachSchoolAndManager(teacher, teacher.schoolId, teacher.createdBy);

        return res.json({ ok: true, profile: teacher, role: 'teacher' });
      } catch (err) {
        console.error('GET /profile (teacher) error', err && (err.stack||err));
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
    }

    // Admin/manager/other -> user doc fallback
    try {
      const id = me._id || me.id;
      let outUser = null;
      if (id && isObjectIdString(String(id))) {
        const u = await User.findById(String(id)).select('-passwordHash').lean().catch(()=>null);
        if (u) outUser = u;
      }
      if (!outUser) {
        outUser = { _id: String(me._id || me.id || ''), fullname: me.fullname || '', email: me.email || '', role: me.role || 'user' };
      }

      if (outUser.schoolId) {
        await attachSchoolAndManager(outUser, outUser.schoolId, outUser.createdBy);
      } else if (outUser.createdBy) {
        await attachSchoolAndManager(outUser, null, outUser.createdBy);
      }

      return res.json({ ok: true, profile: outUser, role: outUser.role || me.role || 'user' });
    } catch (err) {
      console.error('GET /profile (user) error', err && (err.stack||err));
      return res.status(500).json({ ok: false, message: 'Server error' });
    }

  } catch (err) {
    console.error('GET /profile fatal error', err && (err.stack||err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/profile
 *
 * - Students/Teachers/Parents: change their own password only (no old pw required). Other fields ignored.
 * - Admins/Managers: can update their own fullname, email and/or password.
 */
router.put('/', auth, async (req, res) => {
  try {
    const me = req.user || null;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const role = (me.role || '').toLowerCase();
    const payload = req.body || {};

    // -------------------- STUDENT / TEACHER / PARENT: password-only --------------------
    if (['student','teacher','parent'].includes(role)) {
      const newPassword = (payload.password || payload.newPassword || '').toString();
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ ok: false, message: 'New password required (min 6 chars)' });
      }

      // choose correct model
      let Model = null;
      if (role === 'student') Model = Student;
      else if (role === 'teacher') Model = Teacher;
      else if (role === 'parent') Model = Parent;

      if (!Model) return res.status(500).json({ ok: false, message: 'Server missing model for your role' });

      const doc = await Model.findById(String(me._id)).catch(()=>null);
      if (!doc) return res.status(404).json({ ok: false, message: 'Record not found' });

      if (typeof doc.setPassword === 'function') {
        try {
          await doc.setPassword(newPassword);
        } catch (e) {
          console.warn('setPassword failed, falling back to bcrypt', e && e.message ? e.message : e);
          const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
          const hash = await bcrypt.hash(newPassword, rounds);
          if (typeof doc.passwordHash !== 'undefined') doc.passwordHash = hash;
          else if (typeof doc.password !== 'undefined') doc.password = newPassword;
          else doc.passwordHash = hash;
        }
      } else {
        const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
        const hash = await bcrypt.hash(newPassword, rounds);
        if (typeof doc.passwordHash !== 'undefined') doc.passwordHash = hash;
        else if (typeof doc.password !== 'undefined') doc.password = newPassword;
        else doc.passwordHash = hash;
      }

      if (typeof doc.mustChangePassword !== 'undefined') doc.mustChangePassword = false;
      await doc.save();

      return res.json({ ok: true, message: 'Password updated' });
    }

    // -------------------- ADMIN / MANAGER: allow fullname/email/password --------------------
    if (['admin','manager'].includes(role)) {
      const allowedFields = {};
      if (payload.fullname && String(payload.fullname).trim()) allowedFields.fullname = String(payload.fullname).trim();
      if (payload.email && String(payload.email).trim()) allowedFields.email = String(payload.email).trim().toLowerCase();
      const newPassword = payload.password || payload.newPassword || null;

      const user = await User.findById(String(me._id)).catch(()=>null);
      if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

      // if email is changing, ensure uniqueness
      if (allowedFields.email && allowedFields.email !== (user.email || '')) {
        const exists = await User.findOne({ email: allowedFields.email }).lean().catch(()=>null);
        if (exists && String(exists._id) !== String(user._id)) {
          return res.status(400).json({ ok: false, message: 'Email already in use' });
        }
        user.email = allowedFields.email;
      }

      if (allowedFields.fullname) user.fullname = allowedFields.fullname;

      if (newPassword) {
        if (typeof user.setPassword === 'function') {
          try {
            await user.setPassword(newPassword);
          } catch (e) {
            console.warn('user.setPassword failed, falling back to bcrypt', e && e.message ? e.message : e);
            const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
            user.passwordHash = await bcrypt.hash(newPassword, rounds);
          }
        } else {
          const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
          user.passwordHash = await bcrypt.hash(newPassword, rounds);
        }
        if (typeof user.mustChangePassword !== 'undefined') user.mustChangePassword = false;
      }

      await user.save();

      const out = user.toObject ? user.toObject() : user;
      if (out.passwordHash) delete out.passwordHash;
      return res.json({ ok: true, message: 'Profile updated', profile: out });
    }

    // default: disallow
    return res.status(403).json({ ok: false, message: 'Updating profile not allowed for your role here' });

  } catch (err) {
    console.error('PUT /profile error', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/profile/change-password
 * (kept for compatibility; same semantics as PUT for student/teacher/parent)
 */
router.post('/change-password', auth, async (req, res) => {
  try {
    const me = req.user || null;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const role = (me.role || '').toLowerCase();
    if (!['student','teacher','parent'].includes(role)) {
      return res.status(403).json({ ok: false, message: 'Only students, teachers and parents can change password here' });
    }

    const newPassword = (req.body && (req.body.newPassword || req.body.password || '')).toString();
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ ok: false, message: 'New password required (min 6 chars)' });
    }

    let Model = null;
    if (role === 'student') Model = Student;
    else if (role === 'teacher') Model = Teacher;
    else if (role === 'parent') Model = Parent;

    if (!Model) return res.status(500).json({ ok: false, message: 'Model missing' });

    const doc = await Model.findById(String(me._id)).catch(()=>null);
    if (!doc) return res.status(404).json({ ok: false, message: 'Record not found' });

    if (typeof doc.setPassword === 'function') {
      try { await doc.setPassword(newPassword); } catch (e) {
        const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
        const hash = await bcrypt.hash(newPassword, rounds);
        if (typeof doc.passwordHash !== 'undefined') doc.passwordHash = hash;
        else if (typeof doc.password !== 'undefined') doc.password = newPassword;
        else doc.passwordHash = hash;
      }
    } else {
      const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
      const hash = await bcrypt.hash(newPassword, rounds);
      if (typeof doc.passwordHash !== 'undefined') doc.passwordHash = hash;
      else if (typeof doc.password !== 'undefined') doc.password = newPassword;
      else doc.passwordHash = hash;
    }

    if (typeof doc.mustChangePassword !== 'undefined') doc.mustChangePassword = false;
    await doc.save();

    return res.json({ ok: true, message: 'Password changed' });
  } catch (err) {
    console.error('POST /profile/change-password error', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
