import type { MDXComponents } from "mdx/types";
import * as generated from "./generated";
import * as home from "./home";
import { Callout, Card, Cards, Check, Checklist, Choice, Choices, Kbd, markdown, Message, Messages, Shot, Step, Steps, StoryToFact, Tab, Tabs, Term, Terms } from "./parts";

// Everything a docs page's MDX can use by name, with no import (Contributing, Writing docs lists them).
export const components: MDXComponents = {
  ...markdown,
  Callout,
  Steps,
  Step,
  Choices,
  Choice,
  Tabs,
  Tab,
  Checklist,
  Check,
  Terms,
  Term,
  Messages,
  Message,
  StoryToFact,
  Shot,
  Cards,
  Card,
  Kbd,
  ...generated,
  ...home,
};
