// Prints a counter every second. Used to check upload + serial monitor end to end.
unsigned long count = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("Hello from CodeToChip ");
  Serial.println(count++);
  delay(1000);
}
