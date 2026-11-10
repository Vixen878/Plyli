export * from '@/core/types';
export * from '@/core/validation';
export * from '@/core/branching';
export * from '@/core/submissions';
export * from '@/core/migrations';
export * from '@/core/flow-graph';
export * from '@/core/history';
export * from '@/core/attribution';
export * from '@/core/analytics';

import {
  CURRENT_SCHEMA_VERSION,
  FormQuestion,
  FormSchema,
  FormResponseRecord,
  FormRevisionSnapshot,
  generateId,
} from '@/core/types';
import { createRevisionSnapshot } from '@/core/submissions';


export interface TemplateDefinition {
  id: 'event_rsvp' | 'product_feedback' | 'workshop_registration';
  name: string;
  tagline: string;
  category: string;
  accentTheme: 'coral' | 'blue' | 'yellow' | 'pink' | 'sage';
  questionCount: number;
  hasBranching: boolean;
  createForm: () => FormSchema;
}

export function createEventRsvpForm(customId?: string): FormSchema {
  const now = new Date().toISOString();
  const questions: FormQuestion[] = [
    {
      id: 'q_rsvp_name',
      type: 'short_text',
      title: 'First things first — what is your full name?',
      description: 'We will print this on your studio name badge.',
      required: true,
      placeholder: 'e.g. Clara Oswald',
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: 'q_rsvp_attending',
      type: 'yes_no',
      title: 'Will you be joining us in person on November 14th?',
      description: 'If you cannot make it, we will jump straight to a quick note.',
      required: true,
      choices: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      logicRules: [
        {
          id: 'rule_attending_no',
          operator: 'equals',
          value: 'No',
          targetId: 'q_rsvp_note',
        },
      ],
      defaultNextId: 'q_rsvp_guests',
    },
    {
      id: 'q_rsvp_guests',
      type: 'number',
      title: 'How many total guests are in your party (including you)?',
      description: 'Feel free to bring up to 3 studio friends.',
      required: true,
      placeholder: '1',
      minNumber: 1,
      maxNumber: 4,
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: 'q_rsvp_dietary',
      type: 'single_choice',
      title: 'Do you have any dietary preferences for the supper table?',
      description: 'Our kitchen prepares everything fresh that afternoon.',
      required: true,
      choices: [
        { id: 'diet_none', label: 'Everything looks good' },
        { id: 'diet_veg', label: 'Vegetarian' },
        { id: 'diet_vegan', label: 'Plant-Based / Vegan' },
        { id: 'diet_gf', label: 'Gluten-Free' },
      ],
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: 'q_rsvp_email',
      type: 'email',
      title: 'Where should we send your calendar pass & map?',
      description: 'No spam — just the studio door code and directions.',
      required: true,
      placeholder: 'clara@paperworks.org',
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: 'q_rsvp_note',
      type: 'long_text',
      title: 'Any song requests or notes for the hosts?',
      description: 'Optional — leave blank if you are all set!',
      required: false,
      placeholder: 'Write a quick note...',
      logicRules: [],
      defaultNextId: 'completion',
    },
  ];

  return {
    id: customId || generateId('form'),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 1,
    title: 'Autumn Studio Open House RSVP',
    description:
      'Gather guest attendance, party size, and dietary preferences with automatic skip logic for folks who cannot make it.',
    accentTheme: 'coral',
    presentationMode: 'conversational',
    appearance: {
      schemaVersion: 1,
      templateId: 'paper',
      overrides: {},
    },
    questionOrder: questions.map((q) => q.id),
    createdAt: now,
    updatedAt: now,
    welcomeScreen: {
      enabled: true,
      title: 'You’re invited to our Autumn Open House!',
      description:
        'We are opening the studio doors for an evening of letterpress demos, warm cider, and music. Let us know if you can make it.',
      buttonText: 'Count Me In',
      timeEstimate: 'Takes ~1 minute',
      accentColor: 'coral',
    },
    questions,
    completionScreen: {
      title: 'Your RSVP is stamped and saved!',
      description:
        'Thank you for letting us know. We have tucked your response into the guestbook.',
      buttonText: 'Back to Form',
      showAnswerReceipt: true,
    },
  };
}

export function createProductFeedbackForm(customId?: string): FormSchema {
  const now = new Date().toISOString();
  const questions: FormQuestion[] = [
    {
      id: 'q_fb_rating',
      type: 'rating',
      title: 'Overall, how would you rate the paper quality and binding?',
      description: 'Tell us about the paper, binding and overall finish.',
      required: true,
      maxRating: 5,
      logicRules: [
        {
          id: 'rule_low_score',
          operator: 'less_than',
          value: '4',
          targetId: 'q_fb_improve',
        },
      ],
      defaultNextId: 'q_fb_favorite',
    },
    {
      id: 'q_fb_improve',
      type: 'long_text',
      title: 'What disappointed you or could have been crafted better?',
      description: 'Be as candid as you like — this goes straight to our bookbinders.',
      required: true,
      placeholder: 'e.g. Ink bleed-through with fountain pens...',
      logicRules: [],
      defaultNextId: 'q_fb_usecase',
    },
    {
      id: 'q_fb_favorite',
      type: 'multiple_choice',
      title: 'What details stood out to you the most?',
      description: 'Select all the touches you appreciated.',
      required: false,
      choices: [
        { id: 'c1', label: 'Lay-flat stitched spine' },
        { id: 'c2', label: 'Warm ivory 120gsm paper' },
        { id: 'c3', label: 'Tactile letterpress cover' },
        { id: 'c4', label: 'Brass bookmark clip' },
      ],
      logicRules: [],
      defaultNextId: 'q_fb_usecase',
    },
    {
      id: 'q_fb_usecase',
      type: 'single_choice',
      title: 'How do you primarily use your notebook?',
      description: 'Helps us design our next page layouts.',
      required: true,
      choices: [
        { id: 'u1', label: 'Daily planning & task lists' },
        { id: 'u2', label: 'Sketching & visual storyboards' },
        { id: 'u3', label: 'Long-form journaling' },
        { id: 'u4', label: 'Field research & interviews' },
      ],
      logicRules: [],
      defaultNextId: 'q_fb_recommend',
    },
    {
      id: 'q_fb_recommend',
      type: 'yes_no',
      title: 'Would you recommend our stationery to a creative friend?',
      description: 'One last click to wrap up.',
      required: true,
      choices: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      logicRules: [],
      defaultNextId: 'completion',
    },
  ];

  return {
    id: customId || generateId('form'),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 1,
    title: 'Craft Notebook & Stationery Feedback',
    description:
      'Understand what customers love and branch follow-up questions automatically based on their satisfaction rating.',
    accentTheme: 'yellow',
    presentationMode: 'conversational',
    appearance: {
      schemaVersion: 1,
      templateId: 'paper',
      overrides: {},
    },
    questionOrder: questions.map((q) => q.id),
    createdAt: now,
    updatedAt: now,
    welcomeScreen: {
      enabled: true,
      title: 'How is your notebook working for you?',
      description:
        'We read every single note as we prepare our winter batch of stitched paper goods.',
      buttonText: 'Share Feedback',
      timeEstimate: 'Takes 45 seconds',
      accentColor: 'yellow',
    },
    questions,
    completionScreen: {
      title: 'Many thanks for your thoughtful notes!',
      description:
        'Your feedback helps us make better tools for thinkers, makers, and sketchers.',
      buttonText: 'Start Over',
      showAnswerReceipt: true,
    },
  };
}

export function createWorkshopRegistrationForm(customId?: string): FormSchema {
  const now = new Date().toISOString();
  const questions: FormQuestion[] = [
    {
      id: 'q_ws_name',
      type: 'short_text',
      title: 'What is your name?',
      description: 'As you would like it listed on the studio roster.',
      required: true,
      placeholder: 'e.g. Julian Vance',
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: 'q_ws_track',
      type: 'dropdown',
      title: 'Which workshop track are you applying for?',
      description: 'Choose the workshop that matches your experience.',
      required: true,
      choices: [
        { id: 't1', label: 'Foundations: First Riso Print' },
        { id: 't2', label: 'Advanced Lab: 3-Color Zine Edition' },
        { id: 't3', label: 'Poster Club: Botanical Halftones' },
      ],
      logicRules: [
        {
          id: 'rule_adv_track',
          operator: 'equals',
          value: 'Advanced Lab: 3-Color Zine Edition',
          targetId: 'q_ws_portfolio',
        },
      ],
      defaultNextId: 'q_ws_date',
    },
    {
      id: 'q_ws_portfolio',
      type: 'short_text',
      title: 'What zine concept or color palette are you planning to print?',
      description:
        'Since you chose the Advanced Lab, let us know which ink drums to prep.',
      required: true,
      placeholder:
        'e.g. 16-page architectural sketch zine in Fluorescent Pink & Teal',
      logicRules: [],
      defaultNextId: 'q_ws_date',
    },
    {
      id: 'q_ws_date',
      type: 'date',
      title: 'Which Saturday session date works best for you?',
      description: 'Sessions run from 10:00 AM to 3:00 PM.',
      required: true,
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: 'q_ws_email',
      type: 'email',
      title: 'What is your best email for workshop prep notes?',
      description: 'We will send our color separation template 3 days prior.',
      required: true,
      placeholder: 'julian@printclub.co',
      logicRules: [],
      defaultNextId: 'completion',
    },
  ];

  return {
    id: customId || generateId('form'),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 1,
    title: 'Risograph Printmaking Workshop Registration',
    description:
      'Sign up makers for weekend studio sessions with experience-level branching and preferred date selection.',
    accentTheme: 'blue',
    presentationMode: 'conversational',
    appearance: {
      schemaVersion: 1,
      templateId: 'paper',
      overrides: {},
    },
    questionOrder: questions.map((q) => q.id),
    createdAt: now,
    updatedAt: now,
    welcomeScreen: {
      enabled: true,
      title: 'Reserve Your Spot: Risograph Print Lab',
      description:
        'Learn two-color stencil printing, color separation, and zine binding in a small group of 8 makers.',
      buttonText: 'Register Now',
      timeEstimate: 'Takes ~1.5 minutes',
      accentColor: 'blue',
    },
    questions,
    completionScreen: {
      title: 'Spot reserved at the print table!',
      description:
        'Put on an apron — we cannot wait to print with you at the workshop.',
      buttonText: 'Done',
      showAnswerReceipt: true,
    },
  };
}

export function createBlankForm(): FormSchema {
  const now = new Date().toISOString();
  const q1 = generateId('q');
  const q2 = generateId('q');
  const questions: FormQuestion[] = [
    {
      id: q1,
      type: 'short_text',
      title: 'What is your name?',
      description: 'Let us know who we are speaking with.',
      required: true,
      placeholder: 'Type your name...',
      logicRules: [],
      defaultNextId: 'next',
    },
    {
      id: q2,
      type: 'single_choice',
      title: 'How did you hear about this project?',
      description: 'Pick the closest match below.',
      required: true,
      choices: [
        { id: generateId('opt'), label: 'Word of mouth' },
        { id: generateId('opt'), label: 'Design newsletter' },
        { id: generateId('opt'), label: 'Community showcase' },
      ],
      logicRules: [],
      defaultNextId: 'completion',
    },
  ];

  return {
    id: generateId('form'),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 1,
    title: 'Untitled Plyli Form',
    description:
      'A fresh tactile form ready for your questions, appearance template, and branching logic.',
    accentTheme: 'coral',
    presentationMode: 'conversational',
    appearance: {
      schemaVersion: 1,
      templateId: 'paper',
      overrides: {},
    },
    questionOrder: [q1, q2],
    createdAt: now,
    updatedAt: now,
    welcomeScreen: {
      enabled: true,
      title: 'Welcome! We’d love to hear from you.',
      description: 'Take a moment to step through these quick questions.',
      buttonText: 'Begin',
      timeEstimate: 'Takes ~1 minute',
      accentColor: 'coral',
    },
    questions,
    completionScreen: {
      title: 'All done — thank you!',
      description: 'Thank you for sharing your response.',
      buttonText: 'Back to Start',
      showAnswerReceipt: true,
    },
  };
}

export const FORM_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'event_rsvp',
    name: 'Event RSVP',
    tagline:
      'Guest attendance, party count, and smart skip logic for non-attendees.',
    category: 'Gatherings',
    accentTheme: 'coral',
    questionCount: 6,
    hasBranching: true,
    createForm: () => createEventRsvpForm(),
  },
  {
    id: 'product_feedback',
    name: 'Product Feedback',
    tagline:
      'Rating scale that branches into tailored follow-up questions by score.',
    category: 'Research',
    accentTheme: 'yellow',
    questionCount: 5,
    hasBranching: true,
    createForm: () => createProductFeedbackForm(),
  },
  {
    id: 'workshop_registration',
    name: 'Registration',
    tagline:
      'Track selection, portfolio prompt for advanced makers, and date picker.',
    category: 'Education',
    accentTheme: 'blue',
    questionCount: 5,
    hasBranching: true,
    createForm: () => createWorkshopRegistrationForm(),
  },
];

export function createInitialSeedWorkspace(): {
  forms: FormSchema[];
  responses: FormResponseRecord[];
  revisions: FormRevisionSnapshot[];
} {
  const rsvpForm = createEventRsvpForm('form_seed_rsvp');
  const feedbackForm = createProductFeedbackForm('form_seed_feedback');
  const workshopForm = createWorkshopRegistrationForm('form_seed_workshop');

  const seedResponses: FormResponseRecord[] = [
    {
      id: 'resp_seed_1',
      formId: 'form_seed_rsvp',
      formRevision: 1,
      submittedAt: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
      durationSeconds: 48,
      answers: {
        q_rsvp_name: 'Maren Lindqvist',
        q_rsvp_attending: 'Yes',
        q_rsvp_guests: 2,
        q_rsvp_dietary: 'Vegetarian',
        q_rsvp_email: 'maren@nordicpress.se',
        q_rsvp_note: 'Bringing a batch of cardamom buns for the studio table!',
      },
      normalizedAnswers: {
        q_rsvp_name: {
          questionId: 'q_rsvp_name',
          value: 'Maren Lindqvist',
          displayValue: 'Maren Lindqvist',
        },
        q_rsvp_attending: {
          questionId: 'q_rsvp_attending',
          value: 'yes',
          choiceIds: ['yes'],
          displayValue: 'Yes',
        },
        q_rsvp_guests: {
          questionId: 'q_rsvp_guests',
          value: 2,
          displayValue: '2',
        },
        q_rsvp_dietary: {
          questionId: 'q_rsvp_dietary',
          value: 'diet_veg',
          choiceIds: ['diet_veg'],
          displayValue: 'Vegetarian',
        },
        q_rsvp_email: {
          questionId: 'q_rsvp_email',
          value: 'maren@nordicpress.se',
          displayValue: 'maren@nordicpress.se',
        },
        q_rsvp_note: {
          questionId: 'q_rsvp_note',
          value: 'Bringing a batch of cardamom buns for the studio table!',
          displayValue: 'Bringing a batch of cardamom buns for the studio table!',
        },
      },
      visitedQuestionIds: [
        'q_rsvp_name',
        'q_rsvp_attending',
        'q_rsvp_guests',
        'q_rsvp_dietary',
        'q_rsvp_email',
        'q_rsvp_note',
      ],
    },
    {
      id: 'resp_seed_2',
      formId: 'form_seed_rsvp',
      formRevision: 1,
      submittedAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
      durationSeconds: 32,
      answers: {
        q_rsvp_name: 'Theo Takahashi',
        q_rsvp_attending: 'No',
        q_rsvp_note:
          'In Kyoto for a book fair that week — raise a glass of cider for me!',
      },
      normalizedAnswers: {
        q_rsvp_name: {
          questionId: 'q_rsvp_name',
          value: 'Theo Takahashi',
          displayValue: 'Theo Takahashi',
        },
        q_rsvp_attending: {
          questionId: 'q_rsvp_attending',
          value: 'no',
          choiceIds: ['no'],
          displayValue: 'No',
        },
        q_rsvp_note: {
          questionId: 'q_rsvp_note',
          value:
            'In Kyoto for a book fair that week — raise a glass of cider for me!',
          displayValue:
            'In Kyoto for a book fair that week — raise a glass of cider for me!',
        },
      },
      visitedQuestionIds: ['q_rsvp_name', 'q_rsvp_attending', 'q_rsvp_note'],
    },
    {
      id: 'resp_seed_3',
      formId: 'form_seed_rsvp',
      formRevision: 1,
      submittedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      durationSeconds: 54,
      answers: {
        q_rsvp_name: 'Soraia Mendes',
        q_rsvp_attending: 'Yes',
        q_rsvp_guests: 1,
        q_rsvp_dietary: 'Everything looks good',
        q_rsvp_email: 'soraia@atelier-lisboa.pt',
        q_rsvp_note: 'Excited to see the Vandercook proof press in action.',
      },
      normalizedAnswers: {
        q_rsvp_name: {
          questionId: 'q_rsvp_name',
          value: 'Soraia Mendes',
          displayValue: 'Soraia Mendes',
        },
        q_rsvp_attending: {
          questionId: 'q_rsvp_attending',
          value: 'yes',
          choiceIds: ['yes'],
          displayValue: 'Yes',
        },
        q_rsvp_guests: {
          questionId: 'q_rsvp_guests',
          value: 1,
          displayValue: '1',
        },
        q_rsvp_dietary: {
          questionId: 'q_rsvp_dietary',
          value: 'diet_none',
          choiceIds: ['diet_none'],
          displayValue: 'Everything looks good',
        },
        q_rsvp_email: {
          questionId: 'q_rsvp_email',
          value: 'soraia@atelier-lisboa.pt',
          displayValue: 'soraia@atelier-lisboa.pt',
        },
        q_rsvp_note: {
          questionId: 'q_rsvp_note',
          value: 'Excited to see the Vandercook proof press in action.',
          displayValue: 'Excited to see the Vandercook proof press in action.',
        },
      },
      visitedQuestionIds: [
        'q_rsvp_name',
        'q_rsvp_attending',
        'q_rsvp_guests',
        'q_rsvp_dietary',
        'q_rsvp_email',
        'q_rsvp_note',
      ],
    },
    {
      id: 'resp_seed_4',
      formId: 'form_seed_feedback',
      formRevision: 1,
      submittedAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
      durationSeconds: 41,
      answers: {
        q_fb_rating: 5,
        q_fb_favorite: ['Lay-flat stitched spine', 'Warm ivory 120gsm paper'],
        q_fb_usecase: 'Sketching & visual storyboards',
        q_fb_recommend: 'Yes',
      },
      visitedQuestionIds: [
        'q_fb_rating',
        'q_fb_favorite',
        'q_fb_usecase',
        'q_fb_recommend',
      ],
    },
    {
      id: 'resp_seed_5',
      formId: 'form_seed_feedback',
      formRevision: 1,
      submittedAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
      durationSeconds: 63,
      answers: {
        q_fb_rating: 3,
        q_fb_improve:
          'Would love a dotted grid option in addition to plain ivory pages.',
        q_fb_usecase: 'Daily planning & task lists',
        q_fb_recommend: 'Yes',
      },
      visitedQuestionIds: [
        'q_fb_rating',
        'q_fb_improve',
        'q_fb_usecase',
        'q_fb_recommend',
      ],
    },
  ];

  return {
    forms: [rsvpForm, feedbackForm, workshopForm],
    responses: seedResponses,
    revisions: [
      createRevisionSnapshot(rsvpForm),
      createRevisionSnapshot(feedbackForm),
      createRevisionSnapshot(workshopForm),
    ],
  };
}
