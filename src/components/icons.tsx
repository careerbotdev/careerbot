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

// Sign-in providers' marks, drawn one colour like the rest: Google's G (filled) and Lucide's former GitHub mark.
const Google = createLucideIcon("google", [
  [
    "path",
    {
      d: "M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z",
      fill: "currentColor",
      stroke: "none",
      key: "g",
    },
  ],
]);
const GitHub = createLucideIcon("github", [
  [
    "path",
    {
      d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
      key: "body",
    },
  ],
  ["path", { d: "M9 18c-4.51 2-5-2-7-2", key: "tail" }],
]);

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
