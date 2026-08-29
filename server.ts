import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import session from "express-session";

const { Pool } = pg;

declare module "express-session" {
  interface SessionData {
    admin: boolean;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "valora-admin-session-secure-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: "lax"
  }
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// In-memory fallback stores for Reports and Bans
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

// Neon PostgreSQL Database Configuration
const databaseUrl = process.env.DATABASE_URL || process.env.DATABESE_URL;
let pool: pg.Pool | null = null;
let isNeonConnected = false;

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Initialize PostgreSQL Tables for Neon
    pool.query(`
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
      
      CREATE TABLE IF NOT EXISTS bans (
        id SERIAL PRIMARY KEY,
        ban_id VARCHAR(64) UNIQUE,
        ip VARCHAR(128) NOT NULL UNIQUE,
        reason VARCHAR(255) DEFAULT 'Admin Ban',
        banned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `)
      .then(() => {
        isNeonConnected = true;
        console.log("Connected to Neon Database successfully and initialized tables.");
      })
      .catch((err) => {
        console.warn("Neon Database initialization warning, falling back to memory:", err.message);
      });
  } catch (err: any) {
    console.warn("Neon Database pool creation error:", err.message);
  }
} else {
  console.log("DATABASE_URL / DATABESE_URL not provided. Operating with in-memory moderation store.");
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

// Clean URL Canonical Redirection Middleware for public pages
app.use((req, res, next) => {
  const urlPath = req.path;
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  if (urlPath === '/index.html') {
    return res.redirect(301, '/' + queryString);
  }
  if (urlPath === '/chat.html') {
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

app.get("/sitemap.xml", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  res.type("application/xml").sendFile(path.join(__dirname, "public/sitemap.xml"));
});

app.get("/robots.txt", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  res.type("text/plain").sendFile(path.join(__dirname, "public/robots.txt"));
});

app.get("/chat", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
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
