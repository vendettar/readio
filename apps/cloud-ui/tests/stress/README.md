# Memory Stress Testing

This directory contains scripts for long-running memory stress testing of the Readio Lite app.

## Running the Test

This test is skipped by default in CI. To run it manually for profiling:

```bash
# In apps/lite directory
npx playwright test tests/stress/memory.test.ts --project=chromium --headed
```

**Note**: You may need to remove `.skip` from the test file or use `.only` temporarily.

## Methodology

1. **Setup**: Open Chrome DevTools -> Memory Tab.
2. **Baseline**: Take a Heap Snapshot before the test starts (at Home screen).
3. **Execution**: Run the stress test (simulates 50 loops of navigation).
4. **Monitoring**: Watch the "JS Heap" size in the Performance monitor.
5. **Final**: Take a Heap Snapshot after the test completes.
6. **Comparison**: Compare Final vs Baseline. 
   - **Green**: Delta < 10MB.
   - **Yellow**: Delta < 50MB (Investigate).
   - **Red**: Delta > 50MB (Leak Confirmed).

## Findings

*(Log your findings here)*

### [Date] - Baseline Run
- **Baseline**: 25MB
- **Peak**: 45MB
- **Final**: 28MB
- **Delta**: +3MB (Acceptable)
