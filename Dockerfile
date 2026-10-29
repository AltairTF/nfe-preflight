FROM node:24-slim

# xmllint comes with libxml2-utils; it is the only runtime dependency besides Node.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libxml2-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY schemas ./schemas
COPY public ./public
COPY scripts/build-site.ts ./scripts/build-site.ts

# The public pages (home, docs, one page per rejection code) are generated once, at build time.
ARG SITE_URL=http://localhost:3000
ARG CONTACT_EMAIL=
ARG DONATE_URL=
RUN node scripts/build-site.ts

# The SQLite database (clients, keys, usage) lives in a volume so it survives container replacement.
ENV PORT=3000 DB_FILE=/data/nfe-preflight.db
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000

CMD ["node", "src/server.ts"]
