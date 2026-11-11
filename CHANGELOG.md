# Changelog

## Plyli 0.2.0

- Share published forms with custom links, QR codes, embed snippets, campaign links, and social previews. Original links and previous custom slugs continue to resolve.
- Choose a response policy, close a form manually or at a deadline, and customize the messages shown to returning respondents and visitors to closed forms.
- Integrations can identify a verified respondent using the optional `X-Plyli-Respondent` header on authenticated submission requests.
- Sign in with Google and return to the requested form or account page. The dashboard includes profile settings and a session summary.
- Create drafts from pasted or uploaded Plyli form JSON. Manage workspace backups in Data settings and export single forms from their card menus.
- Browse question metrics, branch paths, campaign traffic, and recoverable responses from the Responses views.

Apply both new migrations with `pnpm db:deploy` before starting the new application. Existing links and responses are preserved. Previously stored responses have no respondent identifier, so the new duplicate checks apply to identified responses recorded after the upgrade.

`@plyli/sdk` remains at 0.2.2. Use a direct HTTP request when passing the optional respondent header.
