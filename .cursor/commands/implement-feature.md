# /implement-feature

Read the SENTINEL_PROJECT_PLAN.md file in the project root.
Find the section relevant to the feature I'm asking you to implement.

Before writing any code:
1. Identify the exact files that need to be created or modified
2. List the database tables involved
3. List the API endpoints that will be called
4. Identify any dependencies on other files that must exist first

Then implement the feature following these steps:
1. Create/update TypeScript types in lib/utils/types.ts
2. Create the lib/ module with business logic and tests
3. Create the API route if needed
4. Create the component(s) if needed
5. Wire everything together
6. Run tests and verify

Always check if prerequisite files exist before building on top of them.
If a dependency is missing, tell me and ask whether to build it first.
