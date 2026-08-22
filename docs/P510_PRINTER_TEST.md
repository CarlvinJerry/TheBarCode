# P510 receipt-printer acceptance test

The browser currently prints a 58 mm receipt through the normal Windows printer queue. This is the safest first integration for either USB or Bluetooth because Windows owns the device driver and pairing.

The same procedure applies to the Xprinter XP-P5. In its Windows Printing Preferences, select 58 mm receipt paper, disable banner/header/footer pages, and use continuous receipt/roll media rather than label or black-mark mode.

If paper feeds continuously, cancel the job in the Windows printer queue and power-cycle the printer. Confirm the driver paper type and sensor mode before retrying. TheBarcode now creates an isolated receipt-only print document; it no longer sends the full application page.

Silent direct printing is provided by the TheBarcode localhost Windows print bridge. Run `scripts\install-print-bridge.ps1`, select **Xprinter XP-80** under Settings, enable silent printing, save, and use the test button. The bridge writes ESC/POS to the configured Windows queue and removes print preview while retaining USB and Bluetooth support.

1. Pair or connect the P510 and install the manufacturer driver.
2. In Windows printer settings, print a test page and set the paper width to 58 mm.
3. Make the P510 the default printer for the test session.
4. In TheBarcode, open **Settings → P510 receipt printer → Print test receipt**.
5. Verify shop name, transaction number, items, quantities, totals, payment method, footer, feed length and cut/tear position.
6. Complete one cash, M-Pesa and credit sale, then reprint each receipt.
7. Disconnect the internet and repeat a sale and receipt print; reconnect and confirm it synchronizes exactly once.

Record the exact Windows driver name, Bluetooth pairing behavior, supported code page and ESC/POS capabilities during hardware testing. Direct USB/Bluetooth ESC/POS access should only be added if the Windows queue cannot meet speed or formatting requirements.
