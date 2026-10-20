# Public pinned and patched source is built with the frozen lockfile before this runtime image.
FROM node@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9
WORKDIR /alto
RUN npm install --global pnpm@8.15.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/package.json ./src/
COPY offline-store /offline-store
RUN pnpm install --prod --offline --frozen-lockfile --store-dir /offline-store
COPY src/esm ./src/esm
COPY LICENSE ./LICENSE
USER node
EXPOSE 14337
CMD ["node", "src/esm/cli/alto.js", "run", "--config", "/secrets/alto.json"]
