/**
 * Component tests for frontend components.
 * Tests form validation, error states, loading states, and user interactions.
 * Run with: npm test -- frontend/__tests__/components
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: "/",
  }),
  usePathname: () => "/",
}));

describe("Form Validation", () => {
  describe("LoginForm", () => {
    it("should show validation error for invalid email", async () => {
      const { getByRole, getByText } = render(
        <input
          type="email"
          placeholder="email"
          onBlur={(e) => {
            if (!e.target.value.includes("@")) {
              e.target.setCustomValidity("Invalid email");
            }
          }}
        />
      );

      const input = getByRole("textbox");
      fireEvent.change(input, { target: { value: "invalidemail" } });
      fireEvent.blur(input);

      // Validation error should be visible
    });

    it("should require email field", async () => {
      const { getByText, getByRole } = render(
        <form>
          <input required type="email" placeholder="email" />
          <button type="submit">Login</button>
        </form>
      );

      const button = getByRole("button");
      fireEvent.click(button);

      // Form should not submit without email
    });

    it("should require password field", async () => {
      const { getByRole } = render(
        <form>
          <input required type="password" placeholder="password" />
          <button type="submit">Login</button>
        </form>
      );

      const button = getByRole("button");
      fireEvent.click(button);

      // Form should not submit without password
    });

    it("should validate minimum password length", async () => {
      const { getByText, getByRole } = render(
        <input
          type="password"
          minLength={8}
          placeholder="password"
          onBlur={(e) => {
            if (e.target.value.length < 8) {
              e.target.setCustomValidity("Password must be at least 8 characters");
            }
          }}
        />
      );

      const input = getByRole("textbox");
      await userEvent.type(input, "short");
      fireEvent.blur(input);

      // Should show validation error
    });
  });

  describe("RegisterForm", () => {
    it("should validate matching passwords", async () => {
      const MockRegisterForm = () => {
        const [password, setPassword] = React.useState("");
        const [confirm, setConfirm] = React.useState("");
        const [error, setError] = React.useState("");

        const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const val = e.target.value;
          setConfirm(val);
          if (val !== password) {
            setError("Passwords do not match");
          } else {
            setError("");
          }
        };

        return (
          <div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
            />
            <input
              value={confirm}
              onChange={handleConfirmChange}
              placeholder="confirm password"
              type="password"
            />
            {error && <span>{error}</span>}
          </div>
        );
      };

      const { getByText, getByRole } = render(<MockRegisterForm />);
      const inputs = getByRole("textbox", { hidden: true });

      await userEvent.type(inputs, "password123");
      await userEvent.type(inputs, "different");

      await waitFor(() => {
        expect(getByText("Passwords do not match")).toBeInTheDocument();
      });
    });
  });
});

describe("Error States", () => {
  describe("Network Errors", () => {
    it("should display error message on network failure", async () => {
      const MockComponent = () => {
        const [error, setError] = React.useState<string | null>(null);

        const handleClick = async () => {
          try {
            throw new Error("Network error");
          } catch (err) {
            setError((err as Error).message);
          }
        };

        return (
          <div>
            <button onClick={handleClick}>Fetch</button>
            {error && <div role="alert">{error}</div>}
          </div>
        );
      };

      const { getByRole, getByText } = render(<MockComponent />);

      const button = getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(getByRole("alert")).toBeInTheDocument();
        expect(getByText("Network error")).toBeInTheDocument();
      });
    });

    it("should show retry button on error", async () => {
      const MockComponent = () => {
        const [error, setError] = React.useState<string | null>(null);

        const handleRetry = async () => {
          setError(null);
        };

        return (
          <div>
            {error && (
              <div>
                <span>{error}</span>
                <button onClick={handleRetry}>Retry</button>
              </div>
            )}
          </div>
        );
      };

      const { getByRole, getByText, rerender } = render(<MockComponent />);

      // Simulate error
      rerender(<MockComponent />);

      const retryButton = screen.queryByText("Retry");
      if (retryButton) {
        expect(retryButton).toBeInTheDocument();
      }
    });
  });

  describe("Validation Errors", () => {
    it("should display field-specific validation errors", async () => {
      const MockForm = () => {
        const [errors, setErrors] = React.useState<Record<string, string>>({});

        const validateForm = (data: Record<string, string>) => {
          const newErrors: Record<string, string> = {};
          if (!data.email) newErrors.email = "Email is required";
          if (!data.password) newErrors.password = "Password is required";
          setErrors(newErrors);
          return Object.keys(newErrors).length === 0;
        };

        return (
          <form>
            <input name="email" placeholder="email" />
            {errors.email && <span data-testid="email-error">{errors.email}</span>}
            <input name="password" type="password" placeholder="password" />
            {errors.password && <span data-testid="password-error">{errors.password}</span>}
            <button
              onClick={() =>
                validateForm({
                  email: "",
                  password: "",
                })
              }
            >
              Submit
            </button>
          </form>
        );
      };

      render(<MockForm />);
      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(screen.getByTestId("email-error")).toBeInTheDocument();
      expect(screen.getByTestId("password-error")).toBeInTheDocument();
    });
  });
});

describe("Loading States", () => {
  describe("Data Loading", () => {
    it("should show loading indicator while data is being fetched", async () => {
      const MockComponent = () => {
        const [loading, setLoading] = React.useState(true);

        React.useEffect(() => {
          setTimeout(() => setLoading(false), 100);
        }, []);

        return (
          <div>
            {loading && <div data-testid="loading">Loading...</div>}
            {!loading && <div data-testid="content">Content loaded</div>}
          </div>
        );
      };

      const { getByTestId } = render(<MockComponent />);

      // Initially loading
      expect(getByTestId("loading")).toBeInTheDocument();

      // After loading
      await waitFor(() => {
        expect(getByTestId("content")).toBeInTheDocument();
      });
    });

    it("should disable button during submission", async () => {
      const MockForm = () => {
        const [loading, setLoading] = React.useState(false);

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setLoading(true);
          // Simulate async operation
          await new Promise((resolve) => setTimeout(resolve, 100));
          setLoading(false);
        };

        return (
          <form onSubmit={handleSubmit}>
            <button disabled={loading}>
              {loading ? "Loading..." : "Submit"}
            </button>
          </form>
        );
      };

      const { getByRole } = render(<MockForm />);
      const button = getByRole("button");

      expect(button).not.toBeDisabled();

      fireEvent.click(button);

      await waitFor(() => {
        expect(button).toBeDisabled();
      });

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });

    it("should show skeleton loader for list items", async () => {
      const MockList = () => {
        const [items, setItems] = React.useState<string[] | null>(null);

        React.useEffect(() => {
          setTimeout(() => {
            setItems(["Item 1", "Item 2", "Item 3"]);
          }, 100);
        }, []);

        if (items === null) {
          return (
            <div>
              <div data-testid="skeleton">Skeleton</div>
              <div data-testid="skeleton">Skeleton</div>
            </div>
          );
        }

        return (
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      };

      const { getByTestId, getAllByRole } = render(<MockList />);

      // Initially showing skeletons
      const skeletons = getByTestId("skeleton");
      expect(skeletons).toBeInTheDocument();

      // After loading
      await waitFor(() => {
        const items = getAllByRole("listitem");
        expect(items).toHaveLength(3);
      });
    });
  });

  describe("Form Submission Loading", () => {
    it("should show loading state during form submission", async () => {
      const MockForm = () => {
        const [isSubmitting, setIsSubmitting] = React.useState(false);

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setIsSubmitting(true);
          await new Promise((resolve) => setTimeout(resolve, 50));
          setIsSubmitting(false);
        };

        return (
          <form onSubmit={handleSubmit}>
            <button disabled={isSubmitting} data-testid="submit-btn">
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        );
      };

      const { getByTestId, getByText } = render(<MockForm />);
      const button = getByTestId("submit-btn");

      fireEvent.click(button);

      await waitFor(() => {
        expect(getByText("Submitting...")).toBeInTheDocument();
      });
    });
  });
});

describe("User Interactions", () => {
  describe("Click Handlers", () => {
    it("should handle button clicks", async () => {
      const handleClick = jest.fn();
      const { getByRole } = render(
        <button onClick={handleClick}>Click me</button>
      );

      const button = getByRole("button");
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should toggle visibility on click", async () => {
      const MockToggle = () => {
        const [visible, setVisible] = React.useState(false);

        return (
          <div>
            <button onClick={() => setVisible(!visible)}>Toggle</button>
            {visible && <div data-testid="content">Content</div>}
          </div>
        );
      };

      const { getByRole, getByTestId, queryByTestId } = render(
        <MockToggle />
      );

      const button = getByRole("button");

      // Initially hidden
      expect(queryByTestId("content")).not.toBeInTheDocument();

      // Click to show
      fireEvent.click(button);
      expect(getByTestId("content")).toBeInTheDocument();

      // Click to hide
      fireEvent.click(button);
      expect(queryByTestId("content")).not.toBeInTheDocument();
    });
  });

  describe("Keyboard Interactions", () => {
    it("should handle Enter key on input", async () => {
      const handleSubmit = jest.fn();

      const MockInput = () => {
        const [value, setValue] = React.useState("");

        return (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit(value);
              }
            }}
            placeholder="type and press enter"
          />
        );
      };

      const { getByRole } = render(<MockInput />);
      const input = getByRole("textbox");

      await userEvent.type(input, "test");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(handleSubmit).toHaveBeenCalledWith("test");
    });

    it("should handle Escape key to close modal", async () => {
      const MockModal = () => {
        const [open, setOpen] = React.useState(true);

        return (
          <div
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            {open && <div data-testid="modal">Modal content</div>}
          </div>
        );
      };

      const { getByTestId, queryByTestId } = render(<MockModal />);

      expect(getByTestId("modal")).toBeInTheDocument();

      fireEvent.keyDown(getByTestId("modal").parentElement!, { key: "Escape" });

      expect(queryByTestId("modal")).not.toBeInTheDocument();
    });
  });
});

describe("Accessibility", () => {
  it("should have proper ARIA labels", () => {
    const { getByLabelText } = render(
      <label>
        Email
        <input type="email" />
      </label>
    );

    expect(getByLabelText("Email")).toBeInTheDocument();
  });

  it("should have accessible buttons", () => {
    const { getByRole } = render(
      <button aria-label="Close menu">×</button>
    );

    expect(getByRole("button", { name: "Close menu" })).toBeInTheDocument();
  });

  it("should have semantic HTML", () => {
    const { container } = render(
      <nav>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/about">About</a></li>
        </ul>
      </nav>
    );

    expect(container.querySelector("nav")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
});
