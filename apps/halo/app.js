import { Application, Facade, CoreServiceProvider, RouteNotFoundError, LoggerServiceProvider, HttpServiceProvider, Route, Middleware, Log, ExceptionManager } from "@ecf/http";

const app = new Application();

app.register(CoreServiceProvider);
app.register(HttpServiceProvider);
app.register(LoggerServiceProvider);
app.boot();

Facade.setApplication(app);

// ---- Exception Handling Setup ----
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}

const exceptionManager = app.make("exception.manager");

// Custom renderer: ValidationError → 422 JSON response
exceptionManager.render(ValidationError, (err, req, res) => {
    return res.status(422).json({ error: err.message, type: "ValidationError" });
});

// Custom reporter: log every error to console
exceptionManager.report(Error, (err) => {
    Log.error(`[ExceptionReporter] ${err.name}: ${err.message}`);
});

// ---- 1. Global Function Middleware ----
const requestLogger = (req, res, next) => {
    // console.log(`[Global Logger] ${req.method} ${req.path}`);
    Log.info(`[Global Logger] ${req.method} ${req.path}`)
    return next();
};
app.use(requestLogger);
Log.info("Server runing")
// ---- 2. Global Class-Style Middleware ----
class CustomHeaderMiddleware extends Middleware {
    handle(req, res, next) {
        res.header("X-Powered-By", "ECF Framework");
        return next();
    }
}
app.use(new CustomHeaderMiddleware());

// ---- 3. Inline Middleware Functions ----
const firstMiddleware = (req, res, next) => {
    console.log("[Route Middleware] Executing firstMiddleware for this route");
    return next();
};

const secondMiddleware = (req, res, next) => {
    console.log("[Route Middleware] Executing secondMiddleware for this route");
    return next();
};

const users = [
    { id: 1, name: "John", email: "john@gmail.com" },
    { id: 2, name: "Jane", email: "jane@gmail.com" },
    { id: 3, name: "Bob", email: "bob@gmail.com" },
    { id: 4, name: "Alice", email: "alice@gmail.com" },
    { id: 5, name: "Mike", email: "mike@gmail.com" },
];

// Option A: Array inline middleware: [firstMiddleware, secondMiddleware]
Route.get("/", [firstMiddleware, secondMiddleware], (req, res) => {
    return res.html(`
        <h1>Welcome to the ECF world!</h1>
        <p>Let's explore the features and capabilities of ECF.</p>
    `);
});

Route.get("/about", (req, res) => {
    return res.text("Hi i am ECF i am new use me");
});

// Option B: Single inline middleware: firstMiddleware
Route.get("/users/new", firstMiddleware, (req, res) => {
    //display error form

    return res.html(`
    <h1>New User</h1>
    <form action="/user" method="post">
        <label for="name">Name:</label>
        <input type="text" id="name" name="name">
        <br>
        <label for="email">Email:</label>
        <input type="email" id="email" name="email">
        <br>
        <button type="submit">Create</button>
    </form>
    `);
});


Route.get("/users", (req, res) => {
    return res.html(`
    <h1>Users</h1>
    <ul>
    ${users
            .map((user) => {
                return `
            <li>
                <a href="/users/${user.id}"><strong>${user.name}</strong></a>
                <p>${user.email}</p>
            </li>
        `;
            })
            .join("")}
    </ul>
    <p><a href="/users/new">Add New User</a></p>
    `);
});

// Route for finding by name (case-insensitive) - MUST come before /users/{id}
Route.get("/users/name/{name}", (req, res) => {
    const searchName = req.params.name;
    console.log("Searching for user by name:", searchName);

    // Case-insensitive search
    const user = users.find(
        (user) => user.name.toLowerCase() === searchName.toLowerCase()
    );

    if (!user) {
        // Show suggestions
        const suggestions = users.filter((user) =>
            user.name.toLowerCase().includes(searchName.toLowerCase())
        );

        let suggestionHtml = "";
        if (suggestions.length > 0) {
            suggestionHtml = `
                <h2>Did you mean?</h2>
                <ul>
                    ${suggestions
                    .map(
                        (u) =>
                            `<li><a href="/users/name/${u.name}">${u.name}</a></li>`
                    )
                    .join("")}
                </ul>
            `;
        }

        return res.html(`
        <h1>User not found</h1>
        <p>No user found with name: "${searchName}"</p>
        ${suggestionHtml}
        <p><a href="/users">View all users</a></p>
        `);
    }

    return res.html(`
    <h1>User Profile</h1>
    <p><strong>Name:</strong> ${user.name}</p>
    <p><strong>Email:</strong> ${user.email}</p>
    <p><a href="/users">Back to all users</a></p>
    `);
});

// Route for finding by ID - must come AFTER specific routes
Route.get("/users/{id}", (req, res) => {
    const id = parseInt(req.params.id);
    console.log("Searching for user by ID:", id);

    const user = users.find((user) => user.id === id);
    if (!user) {
        return res.html(`
        <h1>User not found</h1>
        <p>No user found with ID: ${id}</p>
        <p><a href="/users">View all users</a></p>
        `);
    }
    return res.html(`
    <h1>User Profile</h1>
    <p><strong>Name:</strong> ${user.name}</p>
    <p><strong>Email:</strong> ${user.email}</p>
    <p><a href="/users">Back to all users</a></p>
    `);
});

Route.post("/user", async (req, res) => {
    const { name, email } = await req.body();
    if (!name || !email) {
        return res.text("Name and email are required", 422);
    }
    if (!email.includes("@")) {
        return res.text("Email is invalid", 422);
    }
    const existingUser = users.find((user) => user.email === email);
    if (existingUser) {
        return res.text("Email already exists", 422);
    }
    users.push({ id: users.length + 1, name, email });
    return res.redirect("/users");
});

// ---- Exception Test Routes ----

// Test 1: Custom error → ValidationError → 422 JSON response
Route.get("/error", (req, res) => {
    throw new ValidationError("Name field is required");
});

// Test 2: Unknown error → fallback → 500 "Internal Server Error"
Route.get("/crash", (req, res) => {
    throw new Error("Something unexpected happened!");
});



exceptionManager.render(RouteNotFoundError, (err, req, res) => {
    return res.status(404).html(`
        <h1>404 - Page Not Found</h1>
        <p>${err.message}</p>
        <a href="/">Go Home</a>
    `);
});

app.listen(3000, () => {
    // console.log("ecf running at http://localhost:3000");
    Log.log("Server", "stating on Port 3000", "http://localhost:3000")
});