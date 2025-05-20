const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

db.query('SELECT 1', (err, results) => {
  if (err) {
    console.error("❌ Eroare la conectarea la Azure DB:", err);
  } else {
    console.log("✅ Conexiune Azure DB reușită!");
  }
});

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(passport.initialize());

const SECRET_KEY = process.env.JWT_SECRET || "cheie_de_test";

// ✅ Middleware pentru autentificare cu JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ✅ Configurăm strategia Google
passport.use(new GoogleStrategy({
  clientID: '1009532882200-u90dnfrh436osipo5iv33gihnlrrqpcs.apps.googleusercontent.com',
  clientSecret: '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',
  callbackURL: 'http://localhost:5000/auth/google/callback'
},
(accessToken, refreshToken, profile, done) => {
  const email = profile.emails[0].value;
  const username = profile.displayName;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return done(err);

    if (results.length > 0) {
      const user = results[0];
      const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: 86400 });
      return done(null, { token });
    } else {
      db.query(
        'INSERT INTO users (username, email, social_login) VALUES (?, ?, ?)',
        [username, email, true],
        (err, result) => {
          if (err) return done(err);
          const newUserId = result.insertId;
          const token = jwt.sign({ id: newUserId, email }, SECRET_KEY, { expiresIn: 86400 });
          return done(null, { token });
        }
      );
    }
  });
}));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const { token } = req.user;
    res.redirect(`https://gilded-gnome-4e9c2e.netlify.app/index.html?token=${token}`);
  }
);

// ✅ Ruta de test - vezi dacă merge serverul
app.get('/', (req, res) => {
  res.send('API Heritage Running...');
});

// ✅ Ruta /api/me (obligatorie!)
app.get('/api/me', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.query('SELECT id, username, email, role FROM users WHERE id = ?', [userId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: "Utilizator inexistent!" });
    }

    res.json(results[0]);
  });
});


// ✅ REGISTER - înregistrare utilizator
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Completează toate câmpurile!" });
  }

  const hashedPassword = bcrypt.hashSync(password, 8);

  db.query(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [username, email, hashedPassword],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Eroare la înregistrare!" });
      }
      res.json({ message: "Utilizator creat cu succes!" });
    }
  );
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Completează toate câmpurile!" });
  }

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: "Utilizator inexistent!" });
    }

    const user = results[0];
    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Parolă incorectă!" });
    }

    // ✅ Include și rolul în token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role  // adăugat aici
      },
      SECRET_KEY,
      { expiresIn: 86400 }
    );

    res.json({ auth: true, token });
  });
});

// ✅ Ruta doar pentru admin: obține toți utilizatorii
app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Acces interzis" });
  }

  db.query('SELECT id, username, email, role FROM users', (err, results) => {
    if (err) return res.status(500).json({ message: "Eroare la extragere utilizatori" });
    res.json(results);
  });
});

// ✅ Ștergere utilizator
app.delete('/api/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Acces interzis" });
  }

  const userId = req.params.id;

  db.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
    if (err) return res.status(500).json({ message: "Eroare la ștergere utilizator." });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Utilizator inexistent." });

    res.json({ message: "Utilizator șters cu succes!" });
  });
});



// ✅ Adăugare punct de interes
app.post('/api/points', (req, res) => {
  const {
    title,
    description,
    latitude,
    longitude,
    image_url,
    video_url,
    created_by_user_id,
    awareness,
    historical_info,
    architectural_info,
    archaeological_info,
    legal_measures
  } = req.body;

  if (!title || !latitude || !longitude || !created_by_user_id) {
    return res.status(400).json({
      message: "Completează câmpurile necesare: titlu, latitudine, longitudine, utilizator."
    });
  }

  db.query(
    `INSERT INTO points_of_interest 
     (title, description, latitude, longitude, image_url, video_url, created_by_user_id, awareness, historical_info, architectural_info, archaeological_info, legal_measures)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      description,
      latitude,
      longitude,
      image_url,
      video_url,
      created_by_user_id,
      awareness,
      historical_info,
      architectural_info,
      archaeological_info,
      legal_measures
    ],
    (err, result) => {
      if (err) {
        console.error("Eroare la adăugare POI:", err);
        return res.status(500).json({ message: "Eroare la adăugarea punctului de interes!" });
      }
      res.json({ message: "Punct de interes adăugat cu succes!", id: result.insertId });
    }
  );
});

// ✅ Listare toate punctele
app.get('/api/points', (req, res) => {
  db.query('SELECT * FROM points_of_interest', (err, results) => {
    if (err) return res.status(500).json({ message: "Eroare la extragerea punctelor de interes!" });
    res.json(results);
  });
});

// ✅ Obține un punct după ID (🔧 lipsă anterior)
app.get('/api/points/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM points_of_interest WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error("Eroare la extragere punct:", err);
      return res.status(500).json({ message: "Eroare la extragere punct!" });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "Punct inexistent!" });
    }
    res.json(results[0]);
  });
});

// ✅ Actualizare punct de interes
app.put('/api/points/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const {
    title,
    description,
    latitude,
    longitude,
    image_url,
    video_url,
    awareness,
    historical_info,
    architectural_info,
    archaeological_info,
    legal_measures
  } = req.body;

  if (!title && !latitude && !longitude) {
  return res.status(400).json({ message: "Completează cel puțin un câmp!" });
  }


  const sql = `
    UPDATE points_of_interest
    SET title = ?, description = ?, latitude = ?, longitude = ?, image_url = ?, video_url = ?, 
        awareness = ?, historical_info = ?, architectural_info = ?, archaeological_info = ?, legal_measures = ?
    WHERE id = ?
  `;

  const values = [
    title, description, latitude, longitude, image_url, video_url,
    awareness, historical_info, architectural_info, archaeological_info, legal_measures,
    id
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Eroare la actualizare punct:", err);
      return res.status(500).json({ message: "Eroare la actualizare punct de interes!" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Punct inexistent!" });
    }

    res.json({ message: "Punct actualizat cu succes!" });
  });
});


// ✅ Ștergere punct
app.delete('/api/points/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM points_of_interest WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ message: "Eroare la ștergerea punctului de interes!" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Punct de interes inexistent!" });
    res.json({ message: "Punct șters cu succes!" });
  });
});


// ✅ Mesaje (CRUD)

// ✅ Adaugă mesaj
app.post('/api/messages', (req, res) => {
  const { user_id, content, point_of_interest_id, is_general } = req.body;
  if (!user_id || !content || !point_of_interest_id) {
    return res.status(400).json({ message: "Completează user_id, content și point_of_interest_id!" });
  }

  db.query(
    'INSERT INTO messages (user_id, content, point_of_interest_id, is_general) VALUES (?, ?, ?, ?)',
    [user_id, content, point_of_interest_id, is_general || false],
    (err) => {
      if (err) return res.status(500).json({ message: "Eroare la adăugarea mesajului!" });
      res.json({ message: "Mesaj trimis!" });
    });
});

// ✅ Obține toate mesajele pentru un anumit punct de interes
app.get('/api/messages', (req, res) => {
  const poi = req.query.poi;

  if (!poi) {
    return res.status(400).json({ message: "Parametrul 'poi' este necesar." });
  }

  db.query(`
    SELECT messages.*, users.username 
    FROM messages 
    LEFT JOIN users ON messages.user_id = users.id 
    WHERE messages.point_of_interest_id = ?
    ORDER BY messages.id ASC
  `, [poi], (err, results) => {
    if (err) return res.status(500).json({ message: "Eroare la extragerea mesajelor!" });
    res.json(results);
  });
});

// ✅ Șterge mesaj
app.delete('/api/messages/:id', (req, res) => {
  db.query('DELETE FROM messages WHERE id = ?', [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ message: "Eroare la ștergerea mesajului!" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Mesaj inexistent!" });
    res.json({ message: "Mesaj șters!" });
  });
});

// ✅ Editează mesaj
app.put('/api/messages/:id', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ message: "Conținutul este necesar!" });

  db.query('UPDATE messages SET content = ? WHERE id = ?', [content, req.params.id], (err, result) => {
    if (err) return res.status(500).json({ message: "Eroare la actualizare!" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Mesaj inexistent!" });
    res.json({ message: "Mesaj actualizat!" });
  });
});


// ✅ Petiții (CRUD)
// ✅ Creare petiție cu semnături inițiale 0
app.post('/api/petitions', (req, res) => {
  const { title, description, created_by_user_id, point_of_interest_id } = req.body;
  if (!title || !created_by_user_id || !point_of_interest_id)
    return res.status(400).json({ message: "Completează toate câmpurile obligatorii!" });

  db.query(
    'INSERT INTO petitions (title, description, created_by_user_id, point_of_interest_id, signatures_count) VALUES (?, ?, ?, ?, ?)',
    [title, description, created_by_user_id, point_of_interest_id, 0],
    (err) => {
      if (err) return res.status(500).json({ message: "Eroare la creare petiție!" });
      res.json({ message: "Petiție creată!" });
    });
});

// ✅ Listare petiții (include signatures_count)
app.get('/api/petitions', (req, res) => {
  db.query('SELECT * FROM petitions', (err, results) => {
    if (err) return res.status(500).json({ message: "Eroare la listare petiții!" });
    res.json(results);
  });
});

// semnaturile pe doar un om

app.get('/api/my-signed-petitions', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query('SELECT petition_id FROM petition_signatures WHERE user_id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ message: "Eroare la extragerea semnăturilor" });
    const ids = results.map(r => r.petition_id);
    res.json(ids);
  });
});


// ✅ Editare titlu și descriere
// ✅ Editare petiție
app.put('/api/petitions/:id', authenticateToken, (req, res) => {
  const { title, description } = req.body;
  const id = req.params.id;

  if (!title || !description) {
    return res.status(400).json({ message: "Titlul și descrierea sunt necesare!" });
  }

  db.query(
    'UPDATE petitions SET title = ?, description = ? WHERE id = ?',
    [title, description, id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Eroare la actualizare!" });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Petiție inexistentă!" });
      res.json({ message: "Petiție actualizată!" });
    }
  );
});


// ✅ Ștergere petiție
app.delete('/api/petitions/:id', (req, res) => {
  const petitionId = req.params.id;

  // 🔹 Mai întâi ștergem semnăturile asociate
  db.query('DELETE FROM petition_signatures WHERE petition_id = ?', [petitionId], (err) => {
    if (err) {
      console.error("Eroare la ștergerea semnăturilor:", err);
      return res.status(500).json({ message: "Eroare la ștergerea semnăturilor!" });
    }

    // 🔹 Apoi ștergem petiția
    db.query('DELETE FROM petitions WHERE id = ?', [petitionId], (err2, result) => {
      if (err2) {
        console.error("Eroare la ștergerea petiției:", err2);
        return res.status(500).json({ message: "Eroare la ștergerea petiției!" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Petiție inexistentă!" });
      }

      res.json({ message: "Petiție ștearsă!" });
    });
  });
});



// ✅ Semnare petiție (crește signatures_count cu 1)

app.post('/api/petitions/:id/sign', authenticateToken, (req, res) => {
  const petitionId = req.params.id;
  const userId = req.user.id;

  // Verifică dacă a mai semnat
  db.query(
    'SELECT * FROM petition_signatures WHERE petition_id = ? AND user_id = ?',
    [petitionId, userId],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Eroare la verificare semnătură!" });
      if (results.length > 0) {
        return res.status(400).json({ message: "Ai semnat deja această petiție." });
      }

      // Semnează
      db.query(
        'INSERT INTO petition_signatures (petition_id, user_id) VALUES (?, ?)',
        [petitionId, userId],
        (err) => {
          if (err) return res.status(500).json({ message: "Eroare la semnare!" });

          // Actualizează numărul total
          db.query(
            'UPDATE petitions SET signatures_count = signatures_count + 1 WHERE id = ?',
            [petitionId],
            (err) => {
              if (err) return res.status(500).json({ message: "Semnătura a fost salvată, dar nu s-a putut actualiza contorul." });
              res.json({ message: "Semnătură înregistrată!" });
            }
          );
        }
      );
    }
  );
});

//Donatii
// ✅ Middleware: doar adminul poate continua
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Acces interzis - doar pentru admin" });
  }
  next();
}

// ✅ Admin - creează o campanie de donații
app.post('/api/admin/donations', authenticateToken, requireAdmin, (req, res) => {
  const { title, description, point_of_interest_id } = req.body;
  if (!title || !point_of_interest_id) {
    return res.status(400).json({ message: "Titlu și punct de interes sunt necesare!" });
  }

  db.query(
    'INSERT INTO donation_campaigns (title, description, point_of_interest_id) VALUES (?, ?, ?)',
    [title, description, point_of_interest_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Eroare la creare campanie!" });
      res.json({ message: "Campanie creată cu succes!" });
    }
  );
});

// ✅ Admin - editează o campanie
app.put('/api/admin/donations/:id', authenticateToken, requireAdmin, (req, res) => {
  const { title, description } = req.body;
  const id = req.params.id;

  if (!title || !description) {
    return res.status(400).json({ message: "Titlul și descrierea sunt necesare!" });
  }

  db.query(
    'UPDATE donation_campaigns SET title = ?, description = ? WHERE id = ?',
    [title, description, id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Eroare la actualizare!" });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Campanie inexistentă!" });
      res.json({ message: "Campanie actualizată!" });
    }
  );
});

// ✅ Admin - șterge o campanie
app.delete('/api/admin/donations/:id', authenticateToken, requireAdmin, (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM donation_campaigns WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ message: "Eroare la ștergere campanie!" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Campanie inexistentă!" });
    res.json({ message: "Campanie ștearsă!" });
  });
});

// ✅ Public - listează toate campaniile de donații
app.get('/api/donation-campaigns', (req, res) => {
  const sql = `
    SELECT 
      dc.id,
      dc.title,
      dc.description,
      dc.point_of_interest_id,
      poi.title AS poi_title,
      IFNULL(SUM(d.amount), 0) AS total_donated,
      COUNT(DISTINCT d.user_id) AS donors
    FROM donation_campaigns dc
    LEFT JOIN points_of_interest poi ON dc.point_of_interest_id = poi.id
    LEFT JOIN donations d ON d.campaign_id = dc.id
    GROUP BY dc.id, dc.title, dc.description, dc.point_of_interest_id, poi.title
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ EROARE SQL la /api/donation-campaigns:", err); // 👈 ADĂUGĂ ASTA
      return res.status(500).json({ message: "Eroare la extragere campanii!" });
    }
    res.json(results);
  });
});


// ✅ Utilizator - donează la o campanie
app.post('/api/donations/:campaign_id', authenticateToken, (req, res) => {
  const campaign_id = req.params.campaign_id;
  const user_id = req.user.id;
  const { amount, message } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "Introduceți o sumă pentru donație!" });
  }

  db.query(
    'INSERT INTO donations (user_id, campaign_id, amount, message) VALUES (?, ?, ?, ?)',
    [user_id, campaign_id, amount, message || null],
    (err) => {
      if (err) return res.status(500).json({ message: "Eroare la înregistrare donație!" });
      res.json({ message: "Donație înregistrată cu succes!" });
    }
  );
});

// ✅ Public - donațiile individuale ale unei campanii
app.get('/api/donations/:campaign_id', (req, res) => {
  const campaign_id = req.params.campaign_id;

  db.query(
    `SELECT d.amount, d.message, d.created_at, u.username
     FROM donations d
     LEFT JOIN users u ON d.user_id = u.id
     WHERE d.campaign_id = ?
     ORDER BY d.created_at DESC`,
    [campaign_id],
    (err, results) => {
      if (err) {
        console.error("Eroare la extragere donații:", err);
        return res.status(500).json({ message: "Eroare la extragere donații!" });
      }
      res.json(results);
    }
  );
});



// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
