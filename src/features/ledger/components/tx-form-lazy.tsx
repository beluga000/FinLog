"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentProps } from "react";
import type { TxFormDialog as TxFormDialogType } from "./tx-form";

/*
 * 거래 입력 창은 캡처 가져오기·문자 붙여넣기까지 품은 큰 코드라, 모든 화면 첫 로딩에 싣지 않는다.
 * 창을 처음 열 때 받고, 그 전에 화면이 한가할 때나 버튼에 손이 갔을 때 미리 받아 둔다.
 */
const loadTxForm = () => import("./tx-form");

const TxFormDialogImpl = dynamic(() => loadTxForm().then((m) => m.TxFormDialog), { ssr: false });

/** 버튼 hover·touch 때 불러 두면 눌렀을 때 바로 열린다 */
export function preloadTxForm() {
  void loadTxForm();
}

/** 화면이 한가해지면 입력 창 코드를 미리 받아 둔다 */
export function usePreloadTxFormWhenIdle() {
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadTxForm);
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(preloadTxForm, 2000);
    return () => clearTimeout(t);
  }, []);
}

/**
 * TxFormDialog 와 같은 props. 한 번도 열리지 않았으면 아무것도 그리지 않고,
 * 한 번 열린 뒤에는 닫힘 애니메이션·입력 상태를 위해 계속 둔다.
 */
export function LazyTxFormDialog(props: ComponentProps<typeof TxFormDialogType>) {
  const [used, setUsed] = useState(props.open);
  if (props.open && !used) setUsed(true);
  return used ? <TxFormDialogImpl {...props} /> : null;
}
