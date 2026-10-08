"use client";

// One icon per concept, used everywhere that concept appears (DESIGN.md, Iconography; the Icons board in Paper).
// Lucide as drawn: 16px, a 1.5px stroke at every size. Colour comes from the text colour around it.
import {
  Activity,
  Archive,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ChartColumn,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  CircleArrowUp,
  CircleCheck,
  CircleHelp,
  CirclePause,
  Clock,
  Coins,
  Command,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  Flag,
  FolderGit2,
  Gauge,
  GripVertical,
  Inbox,
  Keyboard,
  Layers,
  Lightbulb,
  Link,
  ListChecks,
  ListFilter,
  Lock,
  LoaderCircle,
  LogOut,
  LucideProvider,
  createLucideIcon,
  Mail,
  Menu,
  MessageSquare,
  Mic,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Signpost,
  Square,
  SquareCheck,
  Sun,
  Target,
  TextAlignStart,
  Trash2,
  TrendingUp,
  Undo2,
  User,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

// Other services' own marks (the Icons board's Marks), filled in one colour like the rest: Google's and GitHub's for
// their sign-in, and GitHub's, X's and LinkedIn's in the website's footer.
const mark = (name: string, d: string) => createLucideIcon(name, [["path", { d, fill: "currentColor", stroke: "none", key: "mark" }]]);
const Google = mark(
  "google",
  "M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z",
);
const GitHub = mark(
  "github",
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
);
const XMark = mark(
  "x-mark",
  "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
);
const LinkedIn = mark(
  "linkedin",
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
);

export const Icons = {
  // Areas
  today: Sun,
  review: Inbox,
  pursuits: Target,
  companies: Building2,
  resumes: FileText,
  record: BookOpen,
  goals: Flag,
  reports: ChartColumn,
  settings: Settings,
  // Record
  story: NotebookPen,
  roles: Briefcase,
  projects: FolderGit2,
  skills: ListChecks,
  tools: Wrench,
  certifications: Award,
  breaks: CirclePause,
  insights: Lightbulb,
  // Goals
  limits: Shield,
  directions: Signpost,
  // Reports
  overview: Gauge,
  spending: Wallet,
  trend: TrendingUp,
  // Decisions
  approve: Check,
  approveAll: CheckCheck,
  reject: X,
  edit: Pencil,
  undo: Undo2,
  setAside: Archive,
  delete: Trash2,
  add: Plus,
  select: SquareCheck,
  // Work
  activity: Activity,
  running: LoaderCircle,
  done: CircleCheck,
  failed: CircleAlert,
  tryAgain: RefreshCw,
  // A newer version of CareerBot is out (a self-hosted copy's owner, on Today).
  update: CircleArrowUp,
  builtOn: Layers,
  ask: MessageSquare,
  people: Users,
  email: Mail,
  reminder: Bell,
  date: Calendar,
  time: Clock,
  cost: Coins,
  export: Download,
  copy: Copy,
  link: Link,
  // Voice: Talk, and Stop while listening.
  talk: Mic,
  stop: Square,
  // Interface
  more: Ellipsis,
  openElsewhere: ArrowUpRight,
  // A link on to another page of the website (See how it works →).
  onward: ArrowRight,
  // The docs: Previous (its arrow back), a page's contents (the phone's docs bar, a page in search).
  previous: ArrowLeft,
  contents: TextAlignStart,
  filter: ListFilter,
  sort: ArrowDownUp,
  search: Search,
  command: Command,
  shortcuts: Keyboard,
  help: CircleHelp,
  expand: ChevronDown,
  goIn: ChevronRight,
  back: ChevronLeft,
  switch: ChevronsUpDown,
  sidebar: PanelLeft,
  thirdPane: PanelRight,
  close: X,
  menu: Menu,
  drag: GripVertical,
  account: User,
  signOut: LogOut,
  // A password field's Show password and Hide password.
  showPassword: Eye,
  hidePassword: EyeOff,
  // Sign-in providers, and the sign-in page's Invite only
  google: Google,
  github: GitHub,
  inviteOnly: Lock,
  // CareerBot elsewhere: the website's footer (with GitHub's mark).
  x: XMark,
  linkedin: LinkedIn,
  // The demo: its entry's No sign-up, and an action it refuses because nothing in it can be changed.
  noSignUp: Eye,
  readOnly: Lock,
} as const;

export type IconName = keyof typeof Icons;

// Wraps the app (and Storybook) so every Lucide icon gets the system's size and stroke.
export function IconDefaults({ children }: { children: ReactNode }) {
  return (
    <LucideProvider size={16} strokeWidth={1.5} absoluteStrokeWidth>
      {children}
    </LucideProvider>
  );
}
