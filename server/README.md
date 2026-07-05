# Akù API Server

Node.js + Hono backend — runs on your DigitalOcean Ubuntu Droplet.

---

## Stack

| Layer      | Tech                          |
|------------|-------------------------------|
| Runtime    | Node.js 20 LTS                |
| Framework  | Hono (fast, TypeScript-first) |
| Database   | PostgreSQL 16 + Drizzle ORM   |
| Auth       | Custom JWT (via `jose`)       |
| Email      | Resend                        |
| Process    | pm2                           |
| Proxy      | nginx (TLS termination)       |

---

## 1 — Set up PostgreSQL on the Droplet

```bash
# Install
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# Start + enable
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create DB + user
sudo -u postgres psql <<EOF
CREATE USER aku_user WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE aku_db OWNER aku_user;
\q
EOF
```

---

## 2 — Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # should print v20.x.x
npm -v
```

---

## 3 — Install pm2 globally

```bash
sudo npm install -g pm2
pm2 startup   # follow the printed command to enable auto-start on reboot
```

---

## 4 — Clone the repo and install dependencies

```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/aku.git
cd aku/server
npm install
```

---

## 5 — Configure environment variables

```bash
cp .env.example .env
nano .env
```

Fill in every value. Key ones:

| Variable                   | Where to get it                                      |
|----------------------------|------------------------------------------------------|
| `DATABASE_URL`             | Use the credentials from step 1                      |
| `JWT_SECRET`               | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"` |
| `RESEND_API_KEY`           | resend.com → API Keys                                |
| `EMAIL_FROM`               | `Akù <auth@yourdomain.com>` (must be verified domain)|
| `API_URL`                  | `https://api.yourdomain.com`                         |

---

## 6 — Set up Resend (email)

1. Sign up at [resend.com](https://resend.com) (free — 3,000 emails/month)
2. Go to **Domains** → **Add Domain** → enter your domain (e.g. `yourdomain.com`)
3. Add the DNS records Resend shows you (TXT + CNAME) in your DNS provider
4. Wait for verification (usually < 5 minutes)
5. Go to **API Keys** → **Create API Key** → copy it into `.env` as `RESEND_API_KEY`
6. Set `EMAIL_FROM=Akù <auth@yourdomain.com>` (must use the verified domain)

---

## 7 — Run database migrations

```bash
cd /var/www/aku/server
npm run db:push   # creates all tables in PostgreSQL
```

---

## 8 — Build and start

```bash
npm run build          # compiles TypeScript → dist/
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save               # persist across reboots
pm2 logs aku-api       # tail logs
```

---

## 9 — nginx reverse proxy (with TLS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/aku-api`:

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/aku-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get a free TLS certificate
sudo certbot --nginx -d api.yourdomain.com
```

---

## 10 — Configure the Expo app

In your Expo project root, create `.env` (Expo reads `EXPO_PUBLIC_*` vars):

```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

Then rebuild the app:

```bash
npx expo run:ios     # or run:android
```

---

## API Reference

### Auth

| Method | Path                         | Auth? | Description                    |
|--------|------------------------------|-------|--------------------------------|
| POST   | `/api/auth/magic-link`       | No    | Send magic link email          |
| GET    | `/api/auth/magic-link/verify`| No    | Verify token → redirect to app |
| GET    | `/api/auth/session`          | Yes   | Validate JWT / get user        |
| DELETE | `/api/auth/session`          | Yes   | Sign out (revoke session)      |

### User

| Method | Path               | Auth? | Description                    |
|--------|--------------------|-------|--------------------------------|
| GET    | `/api/user/me`     | Yes   | Get profile                    |
| PUT    | `/api/user/me`     | Yes   | Update name                    |

All protected routes require `Authorization: Bearer JWT` header.

---

## Useful pm2 commands

```bash
pm2 status              # running processes
pm2 logs aku-api        # live logs
pm2 restart aku-api     # restart after code change
pm2 stop aku-api        # stop
pm2 delete aku-api      # remove from pm2
```

## Deploy updates

```bash
cd /var/www/aku
git pull
cd server
npm install
npm run build
pm2 restart aku-api
```
