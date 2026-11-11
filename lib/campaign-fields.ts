export const campaignFields = [
  { key: 'utm_source', label: 'Source', example: 'linkedin', help: 'Where the link was posted or sent from, such as LinkedIn or your newsletter.' },
  { key: 'utm_medium', label: 'Medium', example: 'social', help: 'How people received the link, such as social media, email, or a QR code.' },
  { key: 'utm_campaign', label: 'Campaign', example: 'open_house', help: 'What you’re promoting. Use the same name across channels to group the results.' },
  { key: 'utm_content', label: 'Content', example: 'footer_link', help: 'Optional. Distinguish links in the same campaign, such as a header button and a footer link.' },
  { key: 'utm_term', label: 'Term', example: 'studio_space', help: 'Optional. Record the keyword for a paid search ad. Leave it blank for most links.' },
] as const;
