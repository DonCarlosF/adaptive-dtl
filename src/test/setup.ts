import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library: unmount and clean up the DOM after every test so
// component tests don't leak state into one another.
afterEach(() => {
  cleanup();
});
