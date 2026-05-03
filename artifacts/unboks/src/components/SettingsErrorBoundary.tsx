import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { crashed: boolean; message: string; }

export class SettingsErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      crashed: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  reset = () => this.setState({ crashed: false, message: "" });

  render() {
    if (this.state.crashed) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <p className="text-[14px] font-medium text-[#202124]">Settings failed to load</p>
          <p className="text-[12px] text-[#5f6368] mt-1 max-w-xs">{this.state.message}</p>
          <button
            onClick={this.reset}
            className="mt-4 px-4 py-2 bg-[#1a73e8] text-white text-[13px] rounded-lg hover:bg-[#1557b0]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
