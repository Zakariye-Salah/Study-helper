// scripts/seed-mathgame.js
// Seed MathType and Question sample data (10 questions each).
// Usage: set MONGO_URI and optionally ADMIN_EMAIL, ADMIN_PASSWORD then `node scripts/seed-mathgame.js`

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO = process.env.MONGO_URI || process.env.MONGO || 'mongodb://localhost:27017/myapp';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mathgame-admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

async function main() {
  console.log('Connecting to', MONGO);
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });

  // load models (adjust path if needed)
  const User = require('../models/User'); // assumes same structure as your repo
  const { MathType, Question } = require('../models/Game');

  // create/find admin user
  let admin = await User.findOne({ email: ADMIN_EMAIL }).catch(()=>null);
  if (!admin) {
    console.log('Admin not found; creating admin:', ADMIN_EMAIL);
    try {
      admin = await User.createUser({
        fullname: 'Math Game Admin',
        email: ADMIN_EMAIL,
        phone: '',
        role: 'admin',
        password: ADMIN_PASSWORD,
        schoolId: null,
        createdBy: null
      });
      console.log('Admin created:', admin.email);
    } catch (err) {
      console.error('Failed to create admin (check User model createUser):', err);
      // try to create by direct mongoose if static helper not present
      const u = new User({
        fullname: 'Math Game Admin',
        email: ADMIN_EMAIL,
        role: 'admin',
        passwordHash: '', // you may want to set proper hash via setPassword
      });
      await u.setPassword(ADMIN_PASSWORD);
      await u.save();
      admin = u;
      console.log('Admin created (fallback):', admin.email);
    }
  } else {
    console.log('Using existing admin:', admin.email);
  }

  const adminId = admin._id;

  // taxonomy: create subtopics list (we'll create MathType per subtopic)
  const TAXONOMY = [
    // Basic Arithmetic subtopics (10)
    { title: 'Addition', slug: 'addition', description: 'Addition — combine quantities to get a sum. Examples and quick tips included.', classLevel: ['Primary'] },
    { title: 'Subtraction', slug: 'subtraction', description: 'Subtraction — take away or find difference. Examples included.', classLevel: ['Primary'] },
    { title: 'Multiplication', slug: 'multiplication', description: 'Multiplication — repeated addition. Examples included.', classLevel: ['Primary'] },
    { title: 'Division', slug: 'division', description: 'Division — split into equal parts. Examples included.', classLevel: ['Primary'] },
    { title: 'Decimals', slug: 'decimals', description: 'Decimals — tenths, hundredths, operations and conversions.', classLevel: ['Primary'] },
    { title: 'Fractions', slug: 'fractions', description: 'Fractions — numerator/denominator, operations, simplification.', classLevel: ['Primary'] },
    { title: 'Percentages', slug: 'percentages', description: 'Percentages — per-hundred and conversions.', classLevel: ['Primary'] },
    { title: 'Rounding Numbers', slug: 'rounding', description: 'Rounding — rules for rounding to nearest places.', classLevel: ['Primary'] },
    { title: 'Order of Operations (PEMDAS/BODMAS)', slug: 'order-of-operations', description: 'PEMDAS/BODMAS rules, left→right evaluation of M/D and A/S.', classLevel: ['Primary'] },
    { title: 'Estimation', slug: 'estimation', description: 'Estimation — rounding and approximation techniques.', classLevel: ['Primary'] },

    // Number Systems & Types
    { title: 'Number Systems & Types', slug: 'number-systems', description: 'Natural, whole, integer, rational, irrational, real, complex, binary/hex.', classLevel: ['Secondary'] },

    // Algebra (10)
    { title: 'Expressions and Equations', slug: 'expressions-equations', description: 'Algebraic expressions and solving equations.', classLevel: ['Secondary'] },
    { title: 'Linear Equations', slug: 'linear-equations', description: 'Solve for x in linear equations.', classLevel: ['Secondary'] },
    { title: 'Quadratic Equations', slug: 'quadratic-equations', description: 'Quadratic solutions methods (factor, formula).', classLevel: ['Secondary'] },
    { title: 'Polynomials', slug: 'polynomials', description: 'Polynomials and operations.', classLevel: ['Secondary'] },
    { title: 'Inequalities', slug: 'inequalities', description: 'Solve and graph inequalities.', classLevel: ['Secondary'] },
    { title: 'Exponents and Powers', slug: 'exponents', description: 'Exponents rules and simplification.', classLevel: ['Secondary'] },
    { title: 'Radicals', slug: 'radicals', description: 'Roots and radical arithmetic.', classLevel: ['Secondary'] },
    { title: 'Functions and Graphs', slug: 'functions-graphs', description: 'Function notation, evaluation, simple graphing.', classLevel: ['Secondary'] },
    { title: 'Systems of Equations', slug: 'systems-equations', description: 'Solve systems via substitution/elimination.', classLevel: ['Secondary'] },
    { title: 'Logarithms', slug: 'logarithms', description: 'Log rules and solving simple log equations.', classLevel: ['Secondary'] },

    // Geometry
    { title: 'Points, Lines, and Angles', slug: 'points-lines-angles', description: 'Basic geometry elements and angle rules.', classLevel: ['Secondary'] },
    { title: 'Triangles and Polygons', slug: 'triangles-polygons', description: 'Triangle properties, polygon interior angles.', classLevel: ['Secondary'] },
    { title: 'Circles', slug: 'circles', description: 'Arc, chord, circumference, area basics.', classLevel: ['Secondary'] },
    { title: 'Perimeter, Area, Volume', slug: 'perimeter-area-volume', description: 'Formulas for area/perimeter/volume.', classLevel: ['Secondary'] },
    { title: 'Congruence and Similarity', slug: 'congruence-similarity', description: 'Shape congruence and similarity criteria.', classLevel: ['Secondary'] },
    { title: 'Coordinate Geometry', slug: 'coordinate-geometry', description: 'Points, slopes, line equations on coordinate plane.', classLevel: ['Secondary'] },
    { title: '3D Geometry', slug: '3d-geometry', description: 'Basic solids and surface/volume concepts.', classLevel: ['Secondary'] },
    { title: 'Transformations', slug: 'transformations', description: 'Reflection, rotation, translation basics.', classLevel: ['Secondary'] },

    // Measurement
    { title: 'Measurement', slug: 'measurement', description: 'Units, conversions and applied measurement problems.', classLevel: ['Primary'] },

    // Statistics and Probability
    { title: 'Statistics and Probability', slug: 'statistics-probability', description: 'Mean, median, mode, probability basics.', classLevel: ['Secondary'] },

    // Calculus
    { title: 'Calculus: Limits', slug: 'calculus-limits', description: 'Introduction to limits.', classLevel: ['University'] },
    { title: 'Calculus: Derivatives', slug: 'calculus-derivatives', description: 'Derivatives basic rules.', classLevel: ['University'] },
    { title: 'Calculus: Integrals', slug: 'calculus-integrals', description: 'Basic integration concepts.', classLevel: ['University'] },

    // Linear Algebra
    { title: 'Linear Algebra', slug: 'linear-algebra', description: 'Vectors, matrices, determinants.', classLevel: ['University'] },

    // Discrete Mathematics
    { title: 'Discrete Mathematics', slug: 'discrete-math', description: 'Logic, sets, combinatorics, graph basics.', classLevel: ['University'] },

    // Trigonometry
    { title: 'Trigonometry', slug: 'trigonometry', description: 'Sine, cosine, tangent, identities and solving triangles.', classLevel: ['Secondary'] },

    // Number Theory
    { title: 'Number Theory', slug: 'number-theory', description: 'Primes, divisibility, modular arithmetic.', classLevel: ['University'] },

    // Mathematical Logic
    { title: 'Mathematical Logic', slug: 'math-logic', description: 'Propositions, quantifiers, proof techniques.', classLevel: ['University'] },

    // Specialized (placeholder)
    { title: 'Special Topics (Cryptography/Topology etc.)', slug: 'special-topics', description: 'Specialized advanced topics skeleton.', classLevel: ['University'] }
  ];

  // clear or keep? We will just create new types if slug not exists.
  const createdTypes = [];
  for (const t of TAXONOMY) {
    const exist = await MathType.findOne({ slug: t.slug }).lean().catch(()=>null);
    if (exist) {
      console.log(`MathType exists: ${t.slug} (${exist._id})`);
      createdTypes.push(exist);
      continue;
    }
    const mt = new MathType({
      title: t.title,
      slug: t.slug,
      description: t.description,
      classLevel: t.classLevel || [],
      createdByAdminId: adminId,
      published: true
    });
    await mt.save();
    console.log('Created MathType:', t.slug, mt._id.toString());
    createdTypes.push(mt.toObject());
  }

  // helper to generate simple questions for basic arithmetic types
  function genArithmeticQuestions(slug) {
    const list = [];
    // produce 10 deterministic simple questions per slug
    for (let i = 1; i <= 10; i++) {
      let text = '', answer = null;
      if (slug === 'addition') {
        const a = i, b = i+2;
        text = `${a} + ${b} = ?`;
        answer = a + b;
      } else if (slug === 'subtraction') {
        const a = i+5, b = i;
        text = `${a} - ${b} = ?`;
        answer = a - b;
      } else if (slug === 'multiplication') {
        const a = i, b = 2;
        text = `${a} × ${b} = ?`;
        answer = a * b;
      } else if (slug === 'division') {
        const a = (i+1) * 2, b = 2;
        text = `${a} ÷ ${b} = ?`;
        answer = a / b;
      } else if (slug === 'decimals') {
        const a = (i * 0.5).toFixed(2), b = (i * 0.25).toFixed(2);
        text = `${a} + ${b} = ?`;
        answer = Number((Number(a) + Number(b)).toFixed(3));
      } else if (slug === 'fractions') {
        text = `${i}/4 + 1/4 = ?`;
        // store as string fraction for variability
        const numerator = i + 1;
        answer = `${numerator}/4`;
      } else if (slug === 'percentages') {
        text = `What is ${i * 5}% of 100?`;
        answer = (i * 5);
      } else if (slug === 'rounding') {
        text = `Round ${ (i * 2.37).toFixed(2) } to nearest whole number.`;
        answer = Math.round(Number((i * 2.37).toFixed(2)));
      } else if (slug === 'order-of-operations') {
        text = `${i} + 2 × 3 = ? (apply order of operations)`;
        answer = i + 2 * 3;
      } else if (slug === 'estimation') {
        text = `Estimate ${i*47} + ${i*33} ≈ ? (round to nearest 10)`;
        answer = Math.round((i*47 + i*33)/10)*10;
      } else {
        // fallback generic
        text = `Example question ${i} for ${slug}`;
        answer = i;
      }

      // pick difficulty cycling
      const diffs = ['easy','intermediate','hard','extra_hard','no_way'];
      const difficulty = diffs[(i-1) % diffs.length];
      const timeLimits = { easy:20, intermediate:15, hard:10, extra_hard:5, no_way:2 };

      const q = {
        text,
        answer,
        isMultipleChoice: false,
        options: null,
        difficulty,
        timeLimitSeconds: timeLimits[difficulty],
        classLevel: ['Primary']
      };
      list.push(q);
    }
    return list;
  }

  // generic generator for non-basic topics (10 placeholders)
  function genPlaceholderQuestions(slug, title) {
    const ret = [];
    for (let i=1;i<=10;i++) {
      ret.push({
        text: `Sample ${title} question ${i}: provide the answer.`,
        answer: `answer${i}`,
        isMultipleChoice: false,
        options: null,
        difficulty: i <= 6 ? 'easy' : 'intermediate',
        timeLimitSeconds: i<=6 ? 20 : 15,
        classLevel: ['Secondary']
      });
    }
    return ret;
  }

  // create questions per type
  let totalQuestions = 0;
  for (const mt of createdTypes) {
    // skip if there are already >=10 questions for this type to avoid duplication
    const existingCount = await Question.countDocuments({ mathTypeId: mt._id }).catch(()=>0);
    if (existingCount >= 10) {
      console.log(`MathType ${mt.slug || mt.title} already has ${existingCount} questions — skipping creation.`);
      continue;
    }
    let questions = [];
    const slug = String(mt.slug || '').toLowerCase();
    if (['addition','subtraction','multiplication','division','decimals','fractions','percentages','rounding','order-of-operations','estimation'].includes(slug)) {
      questions = genArithmeticQuestions(slug);
    } else {
      questions = genPlaceholderQuestions(slug, mt.title || slug);
    }

    for (const q of questions) {
      const doc = new Question({
        mathTypeId: mt._id,
        text: q.text,
        options: q.options || null,
        answer: q.answer,
        isMultipleChoice: !!q.isMultipleChoice,
        difficulty: q.difficulty || 'easy',
        timeLimitSeconds: q.timeLimitSeconds || null,
        strictAnswer: !!q.strictAnswer,
        createdByAdminId: adminId,
        classLevel: q.classLevel || []
      });
      await doc.save();
      totalQuestions++;
    }
    console.log(`Inserted ${questions.length} questions for MathType ${mt.slug || mt.title}`);
  }

  console.log('Seed complete. Created/used MathTypes:', createdTypes.length, 'Total questions added:', totalQuestions);
  await mongoose.disconnect();
  console.log('Disconnected. Done.');
}

main().catch(err => {
  console.error('Seed failed', err);
  process.exit(1);
});
