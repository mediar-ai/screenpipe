// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
fn main() -> anyhow::Result<()> {
    println!("{}", screenpipe_bark::download()?.display());
    Ok(())
}
