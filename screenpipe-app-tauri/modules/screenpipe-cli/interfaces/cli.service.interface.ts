import { ScreenpipeSetupParams } from "../types/screenpipe-setup-params";

export interface ScreenpipeCliService {
    setup(params: ScreenpipeSetupParams): void,
    spawn(): Promise<void>
}