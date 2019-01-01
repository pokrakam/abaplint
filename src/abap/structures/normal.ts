import * as Structures from "./";
import * as Statements from "../statements";
import {Structure} from "./_structure";
import {alt, IStructureRunnable, sta, sub} from "./_combi";
import {MacroCall} from "../statements/_statement";

export class Normal extends Structure {

  public getMatcher(): IStructureRunnable {
// note that the sequence of alternatives here influences performance
    return alt(sta(Statements.Move),
               sta(Statements.Call),
               sta(Statements.Data),
               sub(new Structures.If()),
               sta(Statements.Clear),
               sta(Statements.FieldSymbol),
               sta(Statements.CreateObject),
               sta(Statements.CallFunction),
               sta(MacroCall),
               sub(new Structures.Loop()),
               sta(Statements.Append),
               sub(new Structures.Try()),
               sta(Statements.Read),
               sta(Statements.Assert),
               sta(Statements.Return),
               sta(Statements.Select),
               sta(Statements.Assign),
               sta(Statements.InsertInternal),
               sta(Statements.DeleteInternal),
               sta(Statements.Concatenate),
               sub(new Structures.Case()),

               sta(Statements.AddCorresponding),
               sta(Statements.Add),
               sta(Statements.AssignLocalCopy),
               sta(Statements.AuthorityCheck),
               sta(Statements.Back),
               sta(Statements.Break),
               sta(Statements.BreakId),
               sta(Statements.CallDatabase),
               sta(Statements.CallDialog),
               sta(Statements.CallKernel),
               sta(Statements.CallOLE),
               sta(Statements.CallScreen),
               sta(Statements.CallSelectionScreen),
               sta(Statements.CallTransaction),
               sta(Statements.CallTransformation),
               sta(Statements.Check),
               sta(Statements.ClassDefinitionLoad),
               sta(Statements.CloseCursor),
               sta(Statements.CloseDataset),
               sta(Statements.Collect),
               sta(Statements.Commit),
               sta(Statements.Communication),
               sta(Statements.Compute),
               sta(Statements.CallBadi),
               sta(Statements.Condense),
               sta(Statements.Constant),
               sta(Statements.Contexts),
               sta(Statements.Continue),
               sta(Statements.ConvertText),
               sta(Statements.Convert),
               sta(Statements.CreateData),
               sta(Statements.CreateOLE),
               sta(Statements.DeleteCluster),
               sta(Statements.DeleteDatabase),
               sta(Statements.DeleteDataset),
               sta(Statements.DeleteDynpro),
               sta(Statements.DeleteMemory),
               sta(Statements.DeleteReport),
               sta(Statements.DeleteTextpool),
               sta(Statements.Demand),
               sta(Statements.Describe),
               sta(Statements.Detail),
               sta(Statements.Divide),
               sta(Statements.EditorCall),
               sta(Statements.Exit),
               sta(Statements.ExportDynpro),
               sta(Statements.Export),
               sta(Statements.Extract),
               sta(Statements.FetchNext),
               sta(Statements.FieldGroup),
               sta(Statements.Fields),
               sta(Statements.Find),
               sta(Statements.Format),
               sta(Statements.FreeMemory),
               sta(Statements.FreeObject),
               sta(Statements.Free),
               sta(Statements.GenerateDynpro),
               sta(Statements.GenerateReport),
               sta(Statements.GenerateSubroutine),
               sta(Statements.GetBadi),
               sta(Statements.GetBit),
               sta(Statements.GetCursor),
               sta(Statements.GetDataset),
               sta(Statements.GetLocale),
               sta(Statements.GetParameter),
               sta(Statements.GetPFStatus),
               sta(Statements.GetProperty),
               sta(Statements.GetReference),
               sta(Statements.GetRunTime),
               sta(Statements.GetTime),
               sta(Statements.Hide),
               sta(Statements.ImportDynpro),
               sta(Statements.ImportNametab),
               sta(Statements.Import),
               sta(Statements.Infotypes),
               sta(Statements.Include), // include does not have to be at top level
               sta(Statements.InsertDatabase),
               sta(Statements.InsertReport),
               sta(Statements.InsertTextpool),
               sta(Statements.Leave),
               sta(Statements.LoadReport),
               sta(Statements.Local),
               sta(Statements.LogPoint),
               sta(Statements.Message),
               sta(Statements.ModifyLine),
               sta(Statements.ModifyDatabase),
               sta(Statements.ModifyInternal),
               sta(Statements.Multiply),
               sta(Statements.NewLine),
               sta(Statements.NewPage),
               sta(Statements.OpenCursor),
               sta(Statements.OpenDataset),
               sta(Statements.Overlay),
               sta(Statements.Pack),
               sta(Statements.Perform),
               sta(Statements.Position),
               sta(Statements.Put),
               sta(Statements.PrintControl),
               sta(Statements.RaiseEvent),
               sta(Statements.Raise),
               sta(Statements.Ranges),
               sta(Statements.ReadDataset),
               sta(Statements.ReadLine),
               sta(Statements.ReadReport),
               sta(Statements.ReadTextpool),
               sta(Statements.Receive),
               sta(Statements.RefreshControl),
               sta(Statements.Refresh),
               sta(Statements.Reject),
               sta(Statements.Replace),
               sta(Statements.Reserve),
               sta(Statements.Resume),
               sta(Statements.Retry),
               sta(Statements.Rollback),
               sta(Statements.Scan),
               sta(Statements.ScrollList),
               sta(Statements.Search),
               sta(Statements.SetBit),
               sta(Statements.SetBlank),
               sta(Statements.SetCountry),
               sta(Statements.SetCursor),
               sta(Statements.SetDataset),
               sta(Statements.SetExtendedCheck),
               sta(Statements.SetHandler),
               sta(Statements.SetLanguage),
               sta(Statements.SetLeft),
               sta(Statements.SetLocale),
               sta(Statements.SetMargin),
               sta(Statements.SetParameter),
               sta(Statements.SetPFStatus),
               sta(Statements.SetProperty),
               sta(Statements.SetRunTime),
               sta(Statements.SetScreen),
               sta(Statements.SetTitlebar),
               sta(Statements.SetUserCommand),
               sta(Statements.SetUpdateTask),
               sta(Statements.Shift),
               sta(Statements.Skip),
               sta(Statements.SortDataset),
               sta(Statements.Sort),
               sta(Statements.Static),
               sta(Statements.Split),
               sta(Statements.Stop),
               sta(Statements.Submit),
               sta(Statements.Summary),
               sta(Statements.SubtractCorresponding),
               sta(Statements.Subtract),
               sta(Statements.SuppressDialog),
               sta(Statements.Supply),
               sta(Statements.Sum),
               sta(Statements.SyntaxCheck),
               sta(Statements.SystemCall),
               sta(Statements.Tables),
               sta(Statements.Transfer),
               sta(Statements.Translate),
               sta(Statements.Type),
               sta(Statements.Uline),
               sta(Statements.Unassign),
               sta(Statements.Unpack),
               sta(Statements.UpdateDatabase),
               sta(Statements.Wait),
               sta(Statements.Window),
               sta(Statements.Write),
               sub(new Structures.Define()),
               sub(new Structures.TestInjection()),
               sub(new Structures.TestSeam()),
               sub(new Structures.Provide()),
               sub(new Structures.CatchSystemExceptions()),
               sub(new Structures.At()),
               sub(new Structures.Constants()),
               sub(new Structures.Types()),
               sub(new Structures.Statics()),
               sub(new Structures.Select()),
               sub(new Structures.Data()),
               sub(new Structures.TypeEnum()),
               sub(new Structures.While()),
               sub(new Structures.Do()),
               sub(new Structures.ExecSQL()));
  }

}