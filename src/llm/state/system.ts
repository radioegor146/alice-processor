import {State} from "../types";
import {StateServer} from "./types";

export class SystemStateServer implements StateServer {

    getName(): string {
        return "system";
    }

    async getState(): Promise<State> {
        return {
            "date_time": {
                description: "current time and date in DD-MM-YYYY HH:MM:SS format",
                value: this.getCurrentTimeAndDateFormatted()
            }
        };
    }

    private getCurrentTimeAndDateFormatted(): string {
        const date = new Date();
        return `${date.getDate().toString().padStart(2, "0")}-${
            (date.getMonth() + 1).toString().padStart(2, "0")}-${
            date.getFullYear().toString().padStart(4, "0")} ${
            date.getHours().toString().padStart(2, "0")}:${
            date.getMinutes().toString().padStart(2, "0")}:${
            date.getSeconds().toString().padStart(2, "0")}`;
    }
}