// backend/controllers/studentController.js
const bcrypt = require('bcryptjs');

exports.resetPassword = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // generate temp password
    const tempPassword = Math.random().toString(36).slice(-8);

    // hash and save
    const hashed = await bcrypt.hash(tempPassword, 10);
    student.password = hashed;
    await student.save();

    res.json({ tempPassword }); // send plain temp password once
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
