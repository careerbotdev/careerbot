# open-msci-units

Free, openly licensed middle school science units for Canvas, built for blended and remote learning. Grades 6–8, aligned to NGSS (and the Nevada Academic Content Standards for Science, which follow NGSS).

These started as the units a few of us built for our own students during remote teaching in 2020. This repo is a cleaned-up version you can import into your own Canvas course and change however you like.

## What's in here

```
open-msci-units/
├── template/
│   ├── msci-course-template.imscc     # empty course shell with the module structure, ready to import
│   └── unit-design-template.docx      # planning doc: phenomenon, performance expectations, lesson sequence
├── units/
│   ├── grade6/                         # 6 units, each a Canvas export (.imscc) + teacher guide (PDF)
│   ├── grade7/                         # 6 units
│   └── grade8/                         # 6 units
├── rubrics/
│   ├── cer-rubric.md                   # claim-evidence-reasoning rubric, student and teacher versions
│   ├── lab-report-rubric.md
│   └── engineering-notebook-rubric.md
├── home-labs/
│   └── materials-lists.md              # every at-home lab, with kitchen-cupboard substitutions
├── accessibility-checklist.md
└── LICENSE
```

18 of the original units are published here so far. The rest need their images and videos re-checked for licensing before I can share them.

## How every unit is built

Every module in every unit has the same five parts, in the same order, so students always know where to click:

1. **Phenomenon** – a short video or image with a question to wonder about.
2. **Check-in** – one or two quick questions so the teacher can see what students already think.
3. **Investigate** – a simulation or an at-home lab with household materials.
4. **Discuss** – a discussion post with a sentence starter.
5. **Show what you know** – a short auto-graded quiz with feedback written for each wrong answer.

Wrong answer choices are written on purpose: each one matches a common misconception (for example, "a moving object must have a force pushing it"), and the feedback speaks to that misconception instead of just saying "try again."

Each unit also has a teacher guide with the pacing, the standards, answer keys, and notes on where students usually get stuck.

## Using it

### Import the whole course template

1. In Canvas, create a new empty course (or use a sandbox).
2. Go to **Settings → Import Course Content**.
3. Choose **Common Cartridge 1.x Package** and upload `template/msci-course-template.imscc`.
4. Select **All content** and import.

### Import a single unit

Same steps, but upload the `.imscc` file from the unit folder, for example `units/grade8/forces-and-motion.imscc`. Choose **Select specific content** if you only want some modules.

### Not on Canvas?

The teacher guides and student pages are also in each unit folder as PDFs, so you can print them. Teachers in schools without an LMS have used it this way.

## Accessibility

- All videos have captions (checked by hand, not just auto-captions).
- All images have alt text.
- Student pages are written at or below a 6th grade reading level where possible; science vocabulary is defined the first time it shows up.
- Spanish versions of the student pages are included for most grade 7 and 8 units (`/es` folders).

See `accessibility-checklist.md` for the checklist I use before publishing a unit.

## Status

Maintained in my spare time, so updates are slow during the school year. Planned:

- Re-check licensing and publish the remaining units.
- Add Spanish versions for the grade 6 units.
- Add the six-week robotics club onboarding course (VEX IQ).

Issues and suggestions are welcome. If you use a unit with your students, I'd love to hear what worked and where kids got stuck.

## Credits

Built with two fellow middle school science teachers. Thanks to a developer friend for setting up this repo.

## License

Content is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Use it, change it, share it; don't sell it.
