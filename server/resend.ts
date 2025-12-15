export async function sendAuthEmail(
    email: string,
    type: "signup" | "signin",
    link: string
  ) {
    console.log("📧 EMAIL TO:", email);
    console.log(`[${type.toUpperCase()} LINK]:`, link);
  }
  