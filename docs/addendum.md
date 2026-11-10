# Recipe Finder Android Demo — Addendum

## Implementation and handoff context

- The user selected Kotlin for the native Android client and requested a minimal, suitable Android setup.
- The user approved Kotlin with Jetpack Compose as the native Android setup.
- Android UI work should proceed in parallel with the remaining backend work, using coordinated API contracts. The user selected a separate Git worktree for Android work; the `android/` project remains part of the same repository.
- The user requested a single Figma AI prompt under 2,000 words and approved the prompt direction. Once generated and approved, the Figma file is the visual source of truth for implementation and pixel-level review.
- The prompt's reference phone frame is 393 × 852 dp; support narrower phone layouts. Tablet behavior and the minimum Android version remain undecided.

## Demo safety

The current public HTTPS demo API is not access-controlled. Use synthetic disposable accounts only; never use staff personal email addresses, passwords, or other personal information against it. Prefer the local backend for any testing that requires real account data.

## Account behavior

Log out and Delete account are separate actions. Log out ends only the current device session and clears locally stored account/session data. Account deletion requires a separate explicit confirmation. Ratings displayed to others must not reveal the author's identity; account deletion removes the account link from retained ratings.
