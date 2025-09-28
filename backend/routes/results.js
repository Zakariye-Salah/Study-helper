// backend/routes/results.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const resultsController = require('../controllers/resultsController');

// For backwards compatibility many clients call /api/results/me
router.get('/me', requireAuth, resultsController.listStudentResults);

// Also support plain GET /api/results
router.get('/', requireAuth, resultsController.listStudentResults);

// Get the student's result for a specific exam
router.get('/:examId', requireAuth, resultsController.getResultForExam);

module.exports = router;
