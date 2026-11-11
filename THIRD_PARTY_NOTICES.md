# Third-party notices

Plyli is distributed under the [MIT License](LICENSE). Its dependencies retain their own licenses and copyright notices. Installing or packaging Plyli does not replace those terms.

The web application uses Next.js, React, Tailwind CSS, Motion, Lucide icons, Better Auth, Prisma, and Zod. The SDK's runtime dependency is Zod. Dependency versions and transitive dependencies are recorded in `pnpm-lock.yaml`; packages include their own license files.

The application loads Bricolage Grotesque, Plus Jakarta Sans, JetBrains Mono, and Fraunces through Next.js fonts. All four font families use the SIL Open Font License. Their complete copyright and license notices are preserved in [public/licenses/fonts](public/licenses/fonts), alongside the self-hosted application's public assets.

Notices for React, React DOM, Next.js, Motion, Lucide, Tailwind CSS, Zod, the QR Code encoder, React DayPicker, and date-fns are preserved in [public/licenses/libraries](public/licenses/libraries). Lucide's notice includes the ISC terms and the MIT attribution for portions derived from Feather. These notices accompany the built application when `public/` is deployed.

Dependencies are not relicensed under Plyli's MIT license. In particular, platform-specific Sharp/libvips binaries include LGPL terms, and caniuse-lite data uses CC-BY-4.0. Preserve each installed package's LICENSE, COPYING, NOTICE, and relevant source/distribution information when redistributing dependency binaries or datasets. The SDK archive contains Plyli code and its MIT license; Zod is installed separately with its own license.

The Vamori, Veritas, tiny.et, Akarii, and Riff appearance themes use project-owned brand identities. The repository owner has confirmed ownership of these identities and the historical reference assets. The current themes use CSS, shared open fonts, and code-rendered graphics; they do not embed third-party brand logos or proprietary font binaries.

Existing authorship, copyright notices, and Git history are retained. Contributors should identify the source and license of new third-party code or assets and preserve any required notices.
