# Chattingo Dockerization – Challenges & Solutions

## 📌 Overview

While Dockerizing the Chattingo full-stack application, I faced several practical challenges related to:

* React environment variables
* Docker multi-stage builds
* Nginx configuration
* CORS
* Docker networking
* Container-to-container communication
* `localhost` vs Docker service names
* MySQL environment variables
* Docker Compose

This document records the problems I faced, why they happened, and how I solved them.

---

# 1. React Environment Variable Problem

## ❌ Challenge

The React frontend needed to know where the Spring Boot backend was running.

Initially, I used:

```env
REACT_APP_API_URL=http://localhost:8080
```

## 🤔 Why?

React needs the backend URL to send API requests.

For example:

```text
React Frontend
      |
      | API request
      ↓
Spring Boot Backend :8080
```

## ✅ Solution

When using Nginx as a reverse proxy, I can use:

```env
REACT_APP_API_URL=/api
```

Then the browser sends:

```text
http://localhost:9090/api/...
```

and Nginx forwards the request to:

```text
backend:8080
```

---

# 2. `npm install` vs `npm ci`

## ❌ Challenge

I initially used `npm install` while creating the frontend Dockerfile.

## 🤔 Why is this a problem?

For Docker and CI/CD, we normally want the exact dependency versions from `package-lock.json`.

## ✅ Solution

Use:

```bash
npm ci
```

instead of:

```bash
npm install
```

### Difference

```text
npm install
    ↓
Installs dependencies
    ↓
May update package-lock.json
```

```text
npm ci
    ↓
Reads package-lock.json
    ↓
Installs exact versions
```

Therefore:

```dockerfile
RUN npm ci
```

is preferred for reproducible Docker builds.

---

# 3. Understanding `npm run build`

## ❌ Challenge

I was confused about what happens when running:

```bash
npm run build
```

## 🤔 What does it do?

It creates the production version of the React application.

For example:

```text
React source code
      ↓
npm run build
      ↓
build/
├── index.html
├── static/
└── ...
```

The generated files can then be served by Nginx.

---

# 4. Creating a 3-Stage Frontend Dockerfile

## ❌ Challenge

The challenge required a 3-stage Dockerfile for the frontend.

## ✅ Solution

The stages have different responsibilities:

```text
Stage 1
Node.js
Install dependencies
      ↓
Stage 2
Node.js
Build React application
      ↓
Stage 3
Nginx
Serve production files
```

Example structure:

```dockerfile
FROM node:22 AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci


FROM node:22 AS build

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

RUN npm run build


FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

The important idea is:

```text
Node.js → Build application

Nginx → Serve application
```

We don't need Node.js in the final runtime container.

---

# 5. Understanding `apt` vs `apk`

## ❌ Challenge

I was confused about whether to use:

```bash
apt-get
```

or:

```bash
apk
```

## 🤔 Why?

Different Linux distributions use different package managers.

For example:

```text
node:22
   ↓
Debian-based
   ↓
apt-get
```

While:

```text
nginx:alpine
   ↓
Alpine Linux
   ↓
apk
```

## ✅ Solution

For Debian-based images:

```dockerfile
RUN apt-get update
```

For Alpine images:

```dockerfile
RUN apk update
```

However, if the Nginx image does not require additional packages, there is no need to run `apk update`.

---

# 6. Choosing Java Version for Backend

## ❌ Challenge

I was unsure which Java version should be used in the backend Dockerfile.

## 🔎 Solution

I checked `pom.xml`.

The project contains:

```xml
<java.version>17</java.version>
```

Therefore, the Docker image should use Java 17.

Example:

```dockerfile
FROM maven:3.9-eclipse-temurin-17
```

and runtime:

```dockerfile
FROM eclipse-temurin:17-jre
```

The important rule is:

```text
pom.xml
   ↓
Java 17
   ↓
Docker build image Java 17
   ↓
Docker runtime Java 17
```

---

# 7. Backend 3-Stage Dockerfile

## ❌ Challenge

The backend challenge also required a 3-stage Dockerfile.

## 🤔 Why multiple stages?

We don't need Maven inside the final production container.

The process is:

```text
Stage 1
Maven + Java
      ↓
Download dependencies

Stage 2
Maven + Java
      ↓
Build Spring Boot JAR

Stage 3
Java JRE
      ↓
Run JAR
```

This keeps the final image smaller and cleaner.

---

# 8. Nginx Runtime Configuration

## ❌ Challenge

I was confused about how Nginx should serve the React application.

## ✅ Solution

Nginx serves the React production files from:

```text
/usr/share/nginx/html
```

Dockerfile:

```dockerfile
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

The flow becomes:

```text
Browser
   ↓
Nginx :80
   ↓
React static files
```

---

# 9. Nginx Reverse Proxy

## ❌ Challenge

I needed the frontend container to communicate with the backend container.

I initially thought the browser should directly communicate with:

```text
backend:8080
```

## ❌ Why doesn't that work?

`backend` is a Docker service/container name.

The browser is outside the Docker network and normally cannot resolve:

```text
http://backend:8080
```

## ✅ Solution

Use Nginx as a reverse proxy.

```nginx
location /api/ {
    proxy_pass http://backend:8080;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Now:

```text
Browser
   |
   | /api/...
   ↓
Nginx
   |
   | backend:8080
   ↓
Spring Boot
```

---

# 10. Understanding `localhost`

## ❌ Challenge

I was confused about what `localhost` means inside Docker.

## 🤔 Important concept

`localhost` always means:

> "This machine/container."

For example, inside the backend container:

```text
localhost
```

means:

```text
backend container itself
```

It does NOT mean the MySQL container.

Therefore:

```env
MYSQL_HOST=localhost
```

is incorrect when MySQL is running in another container.

---

# 11. Backend Connecting to MySQL

## ❌ Challenge

The backend needed to connect to the MySQL container.

I initially considered:

```env
MYSQL_HOST=localhost
```

## ❌ Problem

MySQL is running in another container.

## ✅ Solution

Use the MySQL service/container name:

```env
MYSQL_HOST=database
```

Example:

```text
backend container
       |
       | MYSQL_HOST=database
       ↓
Docker network
       |
       ↓
database container
```

Docker's internal DNS resolves:

```text
database
```

to the MySQL container.

---

# 12. Docker Network

## ❌ Challenge

The frontend, backend, and database containers needed to communicate with each other.

## ✅ Solution

Create a Docker network:

```bash
docker network create chattingo
```

Then run containers using:

```bash
--network chattingo
```

Example:

```bash
docker run -d \
  --name database \
  --network chattingo \
  mysql:8.0
```

Backend:

```bash
docker run -d \
  --name backend \
  --network chattingo \
  chattingo:backend
```

Frontend:

```bash
docker run -d \
  --name frontend \
  --network chattingo \
  chattingo:frontend
```

Now containers can communicate using their names.

---

# 13. Container Name vs `localhost`

This was one of the most important concepts I learned.

## Container → Container

Use the service/container name:

```text
backend → database:3306
```

```text
frontend/Nginx → backend:8080
```

## Browser → Container

Use the host address and published port:

```text
Browser → localhost:9090
```

or:

```text
Browser → localhost:8080
```

### Simple rule

```text
Browser
   ↓
localhost:PORT

Container
   ↓
service-name:PORT
```

---

# 14. CORS Configuration

## ❌ Challenge

I needed to configure CORS for the frontend and backend.

My frontend was exposed using:

```text
localhost:9090
```

Therefore, the browser's origin is:

```text
http://localhost:9090
```

## ✅ Solution

The backend CORS configuration should contain:

```env
CORS_ALLOWED_ORIGINS=http://localhost:9090
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=*
```

### Important

This:

```text
http://localhost
```

and this:

```text
http://localhost:9090
```

are different origins because the port is part of the origin.

---

# 15. CORS vs Docker Service Names

## ❌ Challenge

I wondered whether I could change:

```env
CORS_ALLOWED_ORIGINS=http://localhost:9090
```

to:

```env
CORS_ALLOWED_ORIGINS=http://frontend
```

## ❌ Why not?

CORS is about the **browser origin**.

The browser sees:

```text
http://localhost:9090
```

It does not see the Docker service name.

Therefore:

```env
CORS_ALLOWED_ORIGINS=http://localhost:9090
```

is correct for the browser.

Docker service names such as:

```text
frontend
backend
database
```

are used for **container-to-container communication**.

---

# 16. Docker Compose Service Names

## ❌ Challenge

When moving from `docker run` commands to Docker Compose, I needed to understand whether I still needed to manually create a network.

## ✅ Solution

Docker Compose automatically creates a network for the services.

Example:

```yaml
services:

  frontend:
    build: ./frontend
    ports:
      - "9090:80"

  backend:
    build: ./backend

  database:
    image: mysql:8.0
```

The services can communicate using:

```text
frontend
backend
database
```

For example:

```text
backend → database:3306
frontend/Nginx → backend:8080
```

---

# 17. `docker run` vs Docker Compose

## Manual Docker

I can manually create the network:

```bash
docker network create chattingo
```

Then:

```bash
docker run --network chattingo ...
```

## Docker Compose

Compose handles the network automatically:

```bash
docker compose up -d
```

The architecture becomes:

```text
                 Docker Compose Network
                         |
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
    frontend          backend         database
      :80              :8080            :3306
        |
        ↓
   Host :9090
```

---

# 18. Using `.env` with Docker

## ❌ Challenge

My `.env` file was inside the backend directory.

Structure:

```text
chattingo/
├── backend/
│   ├── .env
│   ├── Dockerfile
│   └── pom.xml
└── frontend/
```

I needed to pass this `.env` file to Docker.

## ✅ Solution

If running the command from the project root:

```bash
docker run -d \
  --name database \
  --network chattingo \
  --env-file ./backend/.env \
  mysql:8.0
```

If already inside the backend directory:

```bash
docker run -d \
  --name database \
  --network chattingo \
  --env-file .env \
  mysql:8.0
```

The important part is:

```bash
--env-file ./backend/.env
```

or:

```bash
--env-file .env
```

depending on the current directory.

---

# 19. MySQL Environment Variables

## ❌ Challenge

I initially thought the backend `.env` could automatically be used by the MySQL container.

## 🤔 Important

Docker does not automatically understand which variables MySQL needs.

The MySQL image expects variables such as:

```env
MYSQL_ROOT_PASSWORD=yourpassword
MYSQL_DATABASE=chattingo
MYSQL_USER=chattingo
MYSQL_PASSWORD=yourpassword
```

These are different from backend configuration variables.

For example:

```env
MYSQL_HOST=database
```

is useful for the **backend**.

But MySQL itself doesn't need `MYSQL_HOST=database` to start.

---

# 20. Understanding the Final Architecture

After solving these problems, the architecture looks like:

```text
                         Browser
                            |
                            |
                     localhost:9090
                            |
                            ↓
                  ┌─────────────────┐
                  │     Frontend    │
                  │      Nginx      │
                  │      :80        │
                  └────────┬────────┘
                           |
                    /api requests
                           |
                    backend:8080
                           |
                           ↓
                  ┌─────────────────┐
                  │     Backend     │
                  │  Spring Boot    │
                  │      :8080      │
                  └────────┬────────┘
                           |
                     database:3306
                           |
                           ↓
                  ┌─────────────────┐
                  │     MySQL       │
                  │      :3306      │
                  └─────────────────┘

             All containers
             are on the same
             Docker network
```

---

# 21. Most Important Lessons Learned

## Lesson 1 — `localhost`

`localhost` means the machine/container where the request is running.

---

## Lesson 2 — Docker Service Names

Containers on the same Docker network can communicate using service names:

```text
backend
database
frontend
```

---

## Lesson 3 — Browser vs Container

The browser uses:

```text
localhost:9090
```

Containers use:

```text
backend:8080
database:3306
```

---

## Lesson 4 — CORS

CORS uses the browser's origin:

```env
CORS_ALLOWED_ORIGINS=http://localhost:9090
```

It does not use:

```env
CORS_ALLOWED_ORIGINS=http://backend
```

---

## Lesson 5 — Nginx

Nginx can communicate with the backend using:

```nginx
proxy_pass http://backend:8080;
```

because Nginx is running inside Docker.

---

## Lesson 6 — MySQL

The backend should connect to MySQL using:

```env
MYSQL_HOST=database
```

not:

```env
MYSQL_HOST=localhost
```

---

## Lesson 7 — Docker Compose

Docker Compose automatically creates a network and provides service-name DNS.

Therefore:

```text
backend → database
frontend → backend
```

can work without manually creating a Docker network.

---

# 🎯 Final Takeaway

The biggest concept I learned while Dockerizing Chattingo was the difference between **browser communication** and **container communication**.

```text
Browser
   ↓
localhost:9090
   ↓
Nginx
   ↓
backend:8080
   ↓
database:3306
```

### Simple rule to remember:

> **Browser uses `localhost`/domain. Containers use Docker service names.**

This understanding makes Docker networking, CORS, Nginx reverse proxy, and Docker Compose much easier to understand.
