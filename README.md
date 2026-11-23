# MFL Results

A formation-analysis dashboard with a counter matrix, formation picker, matchup reports, match imports, and dark mode. This export uses Cloudflare Workers to serve the app and D1 to store match records. The source can live in a GitHub repository.

## Run on your computer

Use Node.js 24. Open a terminal in this folder and run the following commands.

```sh
npm ci
npm run dev
```

The first run creates a private password in `.dev.vars`, applies the database migration, and prints the local address. Open that address and sign in as `admin` with the value of `MFL_ADMIN_PASSWORD` from `.dev.vars`. The local database is saved in `.wrangler/state`.

In **Import matches**, use **Choose file** to restore the separate `MFL-Results-Matches.json` backup. Review the preview and confirm the import. The database generates its own row IDs as it loads the match records.

## Push the source to GitHub

Create an empty private repository in GitHub. Run these commands in the extracted `mfl-results` folder and replace the remote URL with the one GitHub gives you.

```sh
git init -b main
git add .
git commit -m "Add MFL Results"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Keep your match backup and passwords outside the repository. Git ignores `.dev.vars`, local database files, and generated build files.

## Host with Cloudflare

1. Run the following commands from your checkout.

   ```sh
   npm ci
   npx wrangler login
   npx wrangler d1 create mfl-results
   ```

2. Copy the new D1 `database_id` into `wrangler.jsonc`. Keep the binding name `DB`.
3. Apply the schema and deploy.

   ```sh
   npm run db:remote
   npm run deploy
   npx wrangler secret put MFL_ADMIN_PASSWORD
   ```

4. Enter a strong password when Wrangler asks for the secret. Open the HTTPS address shown by the deploy command and sign in as `admin`. Import the match backup from the app to populate the hosted database.

A Worker requires the password secret before it serves the dashboard or any match records. Local and hosted credentials and databases are configured independently.

Cloudflare can deploy updates when you push to GitHub. In **Workers & Pages**, open the Worker’s **Settings** and connect your repository under **Builds**. Use `npm run build` for the build command and `npx wrangler deploy` for deployment. Apply any future database migrations with `npm run db:remote`. [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)

The export is based on published MFL Results version 5, source revision `b1462a4a19719c422b658bdfd33af57b2cfc8236`.
