import {AbstractType} from "./_abstract_type";

export class CLikeType extends AbstractType {
  public toText() {
    return "```clike```";
  }

  public isGeneric() {
    return true;
  }

  public toABAP(): string {
    throw new Error("clike, generic");
  }

  public containsVoid() {
    return false;
  }

  public toCDS() {
    return "abap.TODO_CLIKE";
  }
}