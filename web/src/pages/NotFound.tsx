import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const NotFound = () => (
    <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 items-center px-4 py-24 sm:px-6">
            <div className="max-w-lg">
                <p className="label-caps">404</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight">No such page</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    That route does not exist in this build.
                </p>
                <Link
                    to="/lab"
                    className="mt-6 inline-block rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Go to the lab
                </Link>
            </div>
        </main>
        <Footer />
    </div>
);

export default NotFound;
