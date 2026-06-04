FROM node:20-slim

WORKDIR /workspace/frontend

# Install deps first for layer caching (built with context = repo root).
# .npmrc carries legacy-peer-deps=true so the container install resolves the
# same way it does locally (openapi-typescript@7 peer-deps typescript@^5 while
# the template ships TS 6). Without it, `npm install` fails with ERESOLVE.
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm install

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
