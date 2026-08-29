import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pg from "pg";
import session from "express-session";

const { Pool } = pg;

export interface AuthUser {
  id: number | string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string;
  created_at?: Date;
  last_login_at?: Date;
}

declare module "express-session" {
  interface SessionData {
    admin?: boolean;
    user?: AuthUser;
    oauthState?: string;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "valora-admin-session-secure-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
});

app.use(sessionMiddleware);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Socket.io Session & Auth Middleware
io.use((socket, next) => {
  const req = socket.request as express.Request;
  sessionMiddleware(req, {} as any, () => {
    if (req.session && req.session.user) {
      (socket as any).authUser = req.session.user;
      next();
    } else {
      console.warn(`[Socket Auth] Unauthorized socket connection rejected: ${socket.id}`);
      next(new Error("Unauthorized: Login required"));
    }
  });
});

const PORT = 3000;

// In-memory fallback stores for Reports, Bans, and Users
interface ReportItem {
  _id: string;
  id: string;
  reporterEmail: string;
  reason: string;
  message: string;
  reportedUserSocketId: string;
  reportedIP: string;
  reportedAt: Date;
  status: string;
}

interface BanItem {
  _id: string;
  id: string;
  ip: string;
  reason: string;
  bannedAt: Date;
}

const inMemoryReports: ReportItem[] = [];
const inMemoryBans: BanItem[] = [];
const inMemoryUsers: AuthUser[] = [];

// Neon PostgreSQL Database Configuration
const databaseUrl = process.env.DATABASE_URL || process.env.DATABESE_URL;
let pool: pg.Pool | null = null;
let isNeonConnected = false;

async function runDatabaseMigrations() {
  if (!pool) return;
  console.log("[Database Migration] Connecting to Neon PostgreSQL and verifying schema...");
  try {
    // 1. Ensure users table exists with base columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(128),
        email VARCHAR(255),
        name VARCHAR(255),
        avatar_url TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Safe additive column migrations for existing users tables
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);

    // 3. Safe unique indexes for google_id and email
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;`);

    // 4. Ensure reports table and columns exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        report_id VARCHAR(64) UNIQUE,
        reporter_email VARCHAR(255) NOT NULL,
        reason VARCHAR(255) NOT NULL,
        message TEXT DEFAULT '',
        reported_user_socket_id VARCHAR(128) NOT NULL,
        reported_ip VARCHAR(128) DEFAULT 'unknown',
        reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(64) DEFAULT 'pending'
      );
    `);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_id VARCHAR(64);`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_email VARCHAR(255);`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reason VARCHAR(255);`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_user_socket_id VARCHAR(128);`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_ip VARCHAR(128) DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(64) DEFAULT 'pending';`);

    // 5. Ensure bans table and columns exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bans (
        id SERIAL PRIMARY KEY,
        ban_id VARCHAR(64) UNIQUE,
        ip VARCHAR(128) NOT NULL UNIQUE,
        reason VARCHAR(255) DEFAULT 'Admin Ban',
        banned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE bans ADD COLUMN IF NOT EXISTS ban_id VARCHAR(64);`);
    await pool.query(`ALTER TABLE bans ADD COLUMN IF NOT EXISTS ip VARCHAR(128);`);
    await pool.query(`ALTER TABLE bans ADD COLUMN IF NOT EXISTS reason VARCHAR(255) DEFAULT 'Admin Ban';`);
    await pool.query(`ALTER TABLE bans ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);

    isNeonConnected = true;
    console.log("[Database Migration] SUCCESS: All tables and columns (users.google_id, reports, bans) are verified and up to date in Neon PostgreSQL.");
  } catch (err: any) {
    console.error("[Database Migration] ERROR: Failed to run database schema migrations:", err.message);
  }
}

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });

    runDatabaseMigrations();
  } catch (err: any) {
    console.error("[Database] Pool initialization error:", err.message);
  }
} else {
  console.log("[Database] DATABASE_URL not provided. Running with in-memory stores for local preview.");
}

// Helper to check if an IP is banned
async function isIpBanned(ip: string): Promise<{ banned: boolean; reason?: string }> {
  if (isNeonConnected && pool) {
    try {
      const res = await pool.query("SELECT reason FROM bans WHERE ip = $1 LIMIT 1", [ip]);
      if (res.rows.length > 0) {
        return { banned: true, reason: res.rows[0].reason };
      }
    } catch {
      // fallback to memory
    }
  }
  const memBan = inMemoryBans.find(b => b.ip === ip);
  if (memBan) return { banned: true, reason: memBan.reason };
  return { banned: false };
}

// Admin Middleware
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.admin) {
    if (req.xhr || req.path.startsWith('/admin/api')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect('/admin/login.html');
  }
  next();
}

// User Authentication Middleware for Chat & Protected Actions
function requireUserAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.user) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    if (req.xhr || req.headers.accept?.includes("application/json") || req.path.startsWith("/api/")) {
      return res.status(401).json({ authenticated: false, error: "Authentication required", redirect: "/login" });
    }
    return res.redirect("/login");
  }
  next();
}

// API Routes
app.post("/api/report", async (req, res) => {
  try {
    const { reporterEmail, reason, message, reportedUserSocketId } = req.body;
    
    if (!reporterEmail || !/^\S+@\S+\.\S+$/.test(reporterEmail)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const reportedIP = userIPs.get(reportedUserSocketId) || "unknown";
    const reportId = "rep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    if (isNeonConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO reports (report_id, reporter_email, reason, message, reported_user_socket_id, reported_ip, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [reportId, reporterEmail, reason, message || "", reportedUserSocketId || "unknown", reportedIP, "pending"]
        );
      } catch (err) {
        console.warn("Failed saving report to Neon DB, stored in memory:", err);
      }
    }

    const memReport: ReportItem = {
      _id: reportId,
      id: reportId,
      reporterEmail,
      reason,
      message: message || "",
      reportedUserSocketId: reportedUserSocketId || "unknown",
      reportedIP,
      reportedAt: new Date(),
      status: "pending"
    };
    inMemoryReports.unshift(memReport);

    console.log(`Report received: ${reporterEmail} reported ${reportedUserSocketId} for ${reason}`);
    res.status(200).json({ success: true, message: "Report submitted successfully" });
  } catch (error) {
    console.error("Error saving report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Auth Routes
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "valora2026";

  if (username === adminUser && password === adminPass) {
    req.session.admin = true;
    console.log(`[ADMIN] Login successful for user: ${username}`);
    res.redirect("/admin/dashboard");
  } else {
    console.log(`[ADMIN] Login failed for user: ${username}`);
    res.redirect("/admin/login.html?error=1");
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login.html');
  });
});

// Admin Dashboard API
app.get("/admin/api/stats", requireAdmin, async (req, res) => {
  try {
    const liveUsers = io.engine.clientsCount;
    let totalReports = inMemoryReports.length;
    let totalBanned = inMemoryBans.length;

    if (isNeonConnected && pool) {
      try {
        const repCountRes = await pool.query("SELECT COUNT(*) AS count FROM reports");
        totalReports = parseInt(repCountRes.rows[0].count, 10) || 0;

        const banCountRes = await pool.query("SELECT COUNT(*) AS count FROM bans");
        totalBanned = parseInt(banCountRes.rows[0].count, 10) || 0;
      } catch {
        // use in-memory values
      }
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const reportsToday = inMemoryReports.filter(r => new Date(r.reportedAt) >= startOfDay).length;
    const bannedToday = inMemoryBans.filter(b => new Date(b.bannedAt) >= startOfDay).length;

    res.json({ totalReports, liveUsers, reportsToday, bannedToday, totalBanned });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/admin/api/reports", requireAdmin, async (req, res) => {
  try {
    if (isNeonConnected && pool) {
      try {
        const result = await pool.query("SELECT * FROM reports ORDER BY reported_at DESC");
        const reports = result.rows.map(r => ({
          _id: r.report_id || String(r.id),
          id: r.report_id || String(r.id),
          reporterEmail: r.reporter_email,
          reason: r.reason,
          message: r.message,
          reportedUserSocketId: r.reported_user_socket_id,
          reportedIP: r.reported_ip,
          reportedAt: r.reported_at,
          status: r.status
        }));
        return res.json(reports);
      } catch {
        // fallback
      }
    }
    res.json(inMemoryReports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

app.patch("/admin/api/reports/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;
    const report = inMemoryReports.find(r => r._id === id || r.id === id);
    if (report) {
      report.status = status;
    }
    if (isNeonConnected && pool) {
      try {
        await pool.query("UPDATE reports SET status = $1 WHERE report_id = $2 OR id::text = $2", [status, id]);
      } catch {
        // ignore
      }
    }
    res.json(report || { success: true, status });
  } catch (error) {
    res.status(500).json({ error: "Failed to update report" });
  }
});

app.delete("/admin/api/reports/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const index = inMemoryReports.findIndex(r => r._id === id || r.id === id);
    if (index !== -1) inMemoryReports.splice(index, 1);

    if (isNeonConnected && pool) {
      try {
        await pool.query("DELETE FROM reports WHERE report_id = $1 OR id::text = $1", [id]);
      } catch {
        // ignore
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete report" });
  }
});

app.get("/admin/api/banned-ips", requireAdmin, async (req, res) => {
  try {
    if (isNeonConnected && pool) {
      try {
        const result = await pool.query("SELECT * FROM bans ORDER BY banned_at DESC");
        const bans = result.rows.map(b => ({
          _id: b.ban_id || String(b.id),
          id: b.ban_id || String(b.id),
          ip: b.ip,
          reason: b.reason,
          bannedAt: b.banned_at
        }));
        return res.json(bans);
      } catch {
        // fallback
      }
    }
    res.json(inMemoryBans);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch banned IPs" });
  }
});

app.delete("/admin/api/banned-ips/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const index = inMemoryBans.findIndex(b => b._id === id || b.id === id);
    if (index !== -1) inMemoryBans.splice(index, 1);

    if (isNeonConnected && pool) {
      try {
        await pool.query("DELETE FROM bans WHERE ban_id = $1 OR id::text = $1", [id]);
      } catch {
        // ignore
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to unban IP" });
  }
});

app.get("/admin/api/analytics", requireAdmin, async (req, res) => {
  try {
    if (isNeonConnected && pool) {
      try {
        const reasonRes = await pool.query(
          "SELECT reason as _id, COUNT(*)::int as count FROM reports GROUP BY reason"
        );
        return res.json({ reportsByReason: reasonRes.rows, reportsByDay: [] });
      } catch {
        // fallback
      }
    }
    const reasonCounts: Record<string, number> = {};
    inMemoryReports.forEach(r => {
      reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
    });
    const reportsByReason = Object.entries(reasonCounts).map(([_id, count]) => ({ _id, count }));

    res.json({ reportsByReason, reportsByDay: [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Admin Page Routes
app.get("/admin/dashboard", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/index.html"));
});

app.get("/admin", (req, res) => {
  res.redirect("/admin/dashboard");
});

app.get("/admin/reports-page", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/reports.html"));
});

app.get("/admin/banned-page", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/banned.html"));
});

app.get("/admin/analytics-page", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/analytics.html"));
});

// Protect other /admin routes
app.use("/admin", (req, res, next) => {
  if (req.path === "/login.html" || req.path === "/admin.css" || req.path === "/admin.js" || req.path === "/login") {
    return next();
  }
  requireAdmin(req, res, next);
});

app.post("/admin/ban", requireAdmin, async (req, res) => {
  try {
    const { ip, reason } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "IP address is required" });
    }
    
    const banId = "ban_" + Date.now();
    const existing = inMemoryBans.find(b => b.ip === ip);
    if (!existing) {
      inMemoryBans.push({
        _id: banId,
        id: banId,
        ip,
        reason: reason || "Admin Ban",
        bannedAt: new Date()
      });
    }

    if (isNeonConnected && pool) {
      try {
        await pool.query(
          "INSERT INTO bans (ban_id, ip, reason) VALUES ($1, $2, $3) ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason",
          [banId, ip, reason || "Admin Ban"]
        );
      } catch {
        // ignore
      }
    }

    console.log(`IP ${ip} has been banned by admin.`);
    
    // Disconnect any active sockets with this IP
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      const sIp = s.handshake.headers['x-forwarded-for'] || s.handshake.address;
      const currentIp = Array.isArray(sIp) ? sIp[0] : sIp;
      if (currentIp === ip) {
        s.disconnect(true);
      }
    }
    
    res.json({ message: `IP ${ip} has been banned.` });
  } catch (error) {
    res.status(500).json({ error: "Failed to ban user" });
  }
});

// Helper for Google OAuth redirect URI
function getGoogleRedirectUri(req: express.Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.trim().replace(/\/$/, '')}/api/auth/google/callback`;
  }
  const rawProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const proto = Array.isArray(rawProto) ? rawProto[0] : (rawProto.toString().split(',')[0].trim());
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/api/auth/google/callback`;
}

// ============================================================================
// Google OAuth 2.0 Authentication Routes
// ============================================================================

// 1. Initiate Google OAuth Flow
app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    console.warn("[Auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables are missing.");
    return res.redirect("/login?error=missing_config");
  }

  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) {
      console.error("[Auth] Failed to save session before OAuth redirect:", err);
    }
    const redirectUri = getGoogleRedirectUri(req);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email",
      access_type: "offline",
      prompt: "select_account",
      state: state
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });
});

// 2. Google OAuth Callback
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    if (req.query.error) {
      console.warn("[Auth] Google OAuth callback returned error:", req.query.error);
      return res.redirect(`/login?error=${encodeURIComponent(req.query.error as string)}`);
    }

    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code) {
      return res.redirect("/login?error=no_code_provided");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      return res.redirect("/login?error=missing_config");
    }

    const redirectUri = getGoogleRedirectUri(req);

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      }).toString()
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[Auth] Token exchange failed:", tokenData);
      return res.redirect(`/login?error=token_exchange_failed&details=${encodeURIComponent(tokenData.error_description || tokenData.error || 'Token request failed')}`);
    }

    // Retrieve Google User Profile
    const userProfileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const googleProfile = await userProfileRes.json() as any;

    if (!userProfileRes.ok || !googleProfile.id || !googleProfile.email) {
      console.error("[Auth] User profile retrieval failed:", googleProfile);
      return res.redirect("/login?error=profile_fetch_failed");
    }

    const googleId = String(googleProfile.id);
    const email = String(googleProfile.email).toLowerCase().trim();
    const name = googleProfile.name || googleProfile.given_name || email.split('@')[0] || "Valora User";
    const avatarUrl = googleProfile.picture || "";

    let authUser: AuthUser;

    if (pool) {
      try {
        // Query users table for existing record by google_id or email
        const existingRes = await pool.query(
          "SELECT id, google_id, email, name, avatar_url, created_at, last_login_at FROM users WHERE google_id = $1 OR email = $2 LIMIT 1",
          [googleId, email]
        );

        if (existingRes.rows.length > 0) {
          // Existing user -> Update last_login_at, ensure google_id is linked, update name and avatar
          const existing = existingRes.rows[0];
          const updateRes = await pool.query(
            `UPDATE users 
             SET last_login_at = CURRENT_TIMESTAMP, 
                 google_id = COALESCE(google_id, $1), 
                 name = COALESCE(NULLIF($2, ''), name), 
                 avatar_url = COALESCE(NULLIF($3, ''), avatar_url) 
             WHERE id = $4 
             RETURNING id, google_id, email, name, avatar_url, created_at, last_login_at`,
            [googleId, name, avatarUrl, existing.id]
          );
          authUser = updateRes.rows[0];
          console.log(`[Auth] Existing user authenticated in PostgreSQL: ${authUser.email} (ID: ${authUser.id}, google_id: ${authUser.google_id})`);
        } else {
          // New user -> Insert new user record in Neon PostgreSQL
          const insertRes = await pool.query(
            `INSERT INTO users (google_id, email, name, avatar_url, created_at, last_login_at) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
             RETURNING id, google_id, email, name, avatar_url, created_at, last_login_at`,
            [googleId, email, name, avatarUrl]
          );
          authUser = insertRes.rows[0];
          console.log(`[Auth] New user registered in PostgreSQL: ${authUser.email} (ID: ${authUser.id}, google_id: ${authUser.google_id})`);
        }
      } catch (dbErr: any) {
        console.error("[Auth] Database error in Google OAuth callback:", dbErr.message);
        throw dbErr;
      }
    } else {
      // Local development fallback when DATABASE_URL is not set
      let memUser = inMemoryUsers.find(u => u.google_id === googleId || u.email === email);
      if (memUser) {
        memUser.last_login_at = new Date();
        if (name) memUser.name = name;
        if (avatarUrl) memUser.avatar_url = avatarUrl;
        authUser = memUser;
        console.log(`[Auth (in-memory)] Existing user logged in: ${authUser.email}`);
      } else {
        authUser = {
          id: inMemoryUsers.length + 1,
          google_id: googleId,
          email: email,
          name: name,
          avatar_url: avatarUrl,
          created_at: new Date(),
          last_login_at: new Date()
        };
        inMemoryUsers.push(authUser);
        console.log(`[Auth (in-memory)] New user logged in: ${authUser.email}`);
      }
    }

    // Establish authenticated session
    req.session.user = {
      id: authUser.id,
      google_id: authUser.google_id,
      email: authUser.email,
      name: authUser.name,
      avatar_url: authUser.avatar_url,
      last_login_at: authUser.last_login_at
    };

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[Auth] Session save error after OAuth login:", saveErr);
      }
      // Redirect authenticated user to VALORA Home
      res.redirect("/?login_success=1");
    });
  } catch (err: any) {
    console.error("[Auth] Google OAuth callback exception:", err);
    res.redirect(`/login?error=server_error&details=${encodeURIComponent(err.message || 'Authentication failed')}`);
  }
});

// 3. Current Authenticated User Status API
app.get("/api/auth/user", (req, res) => {
  if (req.session.user) {
    return res.json({
      authenticated: true,
      user: req.session.user
    });
  }
  res.json({
    authenticated: false,
    user: null
  });
});

// 4. Logout Route
app.all(["/api/auth/logout", "/logout"], (req, res) => {
  req.session.user = undefined;
  req.session.save(() => {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, message: "Logged out successfully" });
    }
    res.redirect("/?logged_out=1");
  });
});

// Clean URL Canonical Redirection Middleware for public pages
app.use((req, res, next) => {
  const urlPath = req.path;
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  if (urlPath === '/index.html') {
    return res.redirect(301, '/' + queryString);
  }
  if (urlPath === '/login.html') {
    return res.redirect(301, '/login' + queryString);
  }
  if (urlPath === '/chat.html') {
    if (!req.session.user) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      return res.redirect(302, '/login');
    }
    return res.redirect(301, '/chat' + queryString);
  }
  if (urlPath === '/privacy.html') {
    return res.redirect(301, '/privacy' + queryString);
  }
  if (urlPath === '/terms.html') {
    return res.redirect(301, '/terms' + queryString);
  }
  next();
});

// Clean Public Page Routes
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/login", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/sitemap.xml", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  res.type("application/xml").sendFile(path.join(__dirname, "public/sitemap.xml"));
});

app.get("/robots.txt", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  res.type("text/plain").sendFile(path.join(__dirname, "public/robots.txt"));
});

// Strictly Protected /chat Route
app.get("/chat", requireUserAuth, (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "public/chat.html"));
});

app.get("/privacy", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.sendFile(path.join(__dirname, "public/privacy.html"));
});

app.get("/terms", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.sendFile(path.join(__dirname, "public/terms.html"));
});

// Serve static files from the 'public' directory with dynamic revalidation
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
}));

// Custom 404 Handler for all remaining unmatched routes
app.use((req, res) => {
  res.status(404).setHeader("Cache-Control", "no-cache").sendFile(path.join(__dirname, "public/404.html"));
});

// Matchmaking state
let waitingUser: string | null = null;
const pairs = new Map<string, string>();
const userNames = new Map<string, string>();
const userIPs = new Map<string, string>();

io.on("connection", async (socket) => {
  // Capture IP
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  
  // Check if IP is banned
  const banStatus = await isIpBanned(ip);
  if (banStatus.banned) {
    console.log(`Banned user attempted to connect: ${ip}`);
    socket.emit("banned", { reason: banStatus.reason || "Banned by admin" });
    socket.disconnect(true);
    return;
  }
  
  console.log("User connected:", socket.id);
  userIPs.set(socket.id, ip);

  socket.on("find-partner", (data) => {
    if (data && data.name) {
      userNames.set(socket.id, data.name);
    }

    // If already in a pair, disconnect first
    if (pairs.has(socket.id)) {
      const partnerId = pairs.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit("partner-disconnected");
        pairs.delete(partnerId);
      }
      pairs.delete(socket.id);
    }

    // If this user was the one waiting, clear it
    if (waitingUser === socket.id) {
      waitingUser = null;
    }

    if (waitingUser && waitingUser !== socket.id) {
      const partnerId = waitingUser;
      waitingUser = null;

      pairs.set(socket.id, partnerId);
      pairs.set(partnerId, socket.id);

      io.to(socket.id).emit("match-found", { 
        partnerId, 
        initiator: true,
        partnerName: userNames.get(partnerId) || 'Stranger'
      });
      io.to(partnerId).emit("match-found", { 
        partnerId: socket.id, 
        initiator: false, 
        partnerName: userNames.get(socket.id) || 'Stranger'
      });
      
      console.log(`Matched ${socket.id} with ${partnerId}`);
    } else {
      waitingUser = socket.id;
      socket.emit("waiting");
      console.log(`User ${socket.id} is waiting`);
    }
  });

  socket.on("signal", (data) => {
    const partnerId = pairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  socket.on("chat-message", (data) => {
    const partnerId = pairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("chat-message", {
        message: data.message,
        senderId: socket.id
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    userNames.delete(socket.id);
    userIPs.delete(socket.id);
    if (waitingUser === socket.id) {
      waitingUser = null;
    }
    const partnerId = pairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partner-disconnected");
      pairs.delete(partnerId);
      pairs.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
