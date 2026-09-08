# Chattingo — Local Setup & Fixes

This document covers the bugs found while running Chattingo locally and how to get the app running.

## 🐛 Issues Found & Fixed

### 1. `stompClient.send is not a function`

**Where:** `frontend/src/Components/HomePage.jsx`

**Cause:** The project uses `@stomp/stompjs` v7 (`"@stomp/stompjs": "^7.0.0"` in `package.json`). In v7, the `Client` class only exposes `.publish()` — the old `.send()` method from earlier versions no longer exists. Every time a message was sent, the app crashed with this error (including chat between two users).

**Fix:**
```diff
- stompClient.send("/app/message", {}, JSON.stringify(message.newMessage));
+ stompClient.publish({
+   destination: "/app/message",
+   body: JSON.stringify(message.newMessage),
+ });
```

### 2. `WeakKeyException: key byte array is 136 bits...`

**Where:** Backend startup, `JwtValidator`

**Cause:** The default JWT secret (`change-me-in-prod` in `application.properties`) is too short. HMAC-SHA algorithms require a key of at least 256 bits.

**Fix:** Set a proper 256-bit+ secret via the `JWT_SECRET` environment variable:
```bash
openssl rand -base64 32
# example output: ukDBaV8gjnBF2sTcvZqoVLlx4oGBi1jsLlOoyRj0AYI=
```
Put the generated value in `backend/.env` as `JWT_SECRET=...`.

### 3. `Access denied for user 'root'@'localhost' (using password: NO)`

**Where:** Backend startup, Hibernate/HikariCP connecting to MySQL

**Cause:** Spring Boot does **not** automatically load a `.env` file. Running `./mvnw spring-boot:run` directly ignores `backend/.env`, so the app fell back to the empty default password defined in `application.properties`.

**Fix:** Export the `.env` file's contents into your shell before starting the backend, in the same terminal session:
```bash
cd backend
export $(grep -v "^#" .env | xargs)
./mvnw spring-boot:run
```

## ✅ Full Setup Instructions

### Prerequisites
- Java 17+ and Maven wrapper (`mvnw`, included in `backend/`)
- Node.js + npm
- MySQL running locally (or reachable at the host/port in your `.env`)

### 1. Configure the backend

Create `backend/.env` (based on `backend/.env.example`):
```env
JWT_SECRET=<generate with: openssl rand -base64 32>
SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/chattingo_db?createDatabaseIfNotExist=true
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=<your MySQL password>
CORS_ALLOWED_ORIGINS=http://localhost:3000
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=*
SPRING_PROFILES_ACTIVE=development
SERVER_PORT=8080
```

Create the database (if it doesn't already exist):
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS chattingo_db;"
```

### 2. Start the backend

```bash
cd backend
export $(grep -v "^#" .env | xargs)
./mvnw spring-boot:run
```

Backend runs at `http://localhost:8080`.

### 3. Start the frontend

In a new terminal:
```bash
cd frontend
npm install
npm start
```

Frontend runs at `http://localhost:3000`.

### 4. Verify

- Sign up / log in on `http://localhost:3000`
- Open a chat with another user and send a message — it should now go through without the `stompClient.send` error.

## Notes

- The `export $(grep -v "^#" .env | xargs)` step must be repeated in every new terminal session, since it only sets variables for that shell. Consider a tool like [`direnv`](https://direnv.net/) or a dotenv-loading library if you want this automated.
- Dockerfiles and `docker-compose.yml` are not yet present in this repo — they're part of the hackathon's own build tasks, not something broken that needed fixing.
