using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class ProductImportTests
{
    [Fact]
    public void Accepts_separate_discrete_size_variants_and_measured_stock()
    {
        var rows = new List<BulkProductRow>
        {
            new(2,"Water","Soft drinks",null,"W500","bottle",500,"ml","Discrete",30,70,24,8,null,0,true),
            new(3,"Water","Soft drinks",null,"W1L","bottle",1,"L","Discrete",50,110,12,4,null,0,true),
            new(4,"Coffee beans","Coffee",null,"BEANS","kg",1,"kg","Measured",900,1400,8.125m,1.5m,null,0,false)
        };

        Assert.Empty(ProductImportRules.Validate(rows));
    }

    [Fact]
    public void Rejects_fractional_discrete_stock_and_duplicate_skus()
    {
        var rows = new List<BulkProductRow>
        {
            new(2,"Flour","Kitchen",null,"FLOUR","bag",5,"kg","Discrete",500,0,2.5m,1,null,0,false),
            new(3,"Flour","Kitchen",null,"flour","bag",5,"kg","Discrete",500,0,2,1,null,0,false)
        };

        var errors = ProductImportRules.Validate(rows);

        Assert.Contains(errors, x => x.RowNumber == 2 && x.Errors.Any(e => e.Contains("whole quantities")));
        Assert.Contains(errors, x => x.RowNumber == 3 && x.Errors.Any(e => e.Contains("duplicated")));
    }

    [Fact]
    public void Normalizes_common_unit_names_without_converting_variant_size()
    {
        Assert.Equal("bottle", ProductImportRules.Unit("Bottles"));
        Assert.Equal("L", ProductImportRules.Unit("litre"));
        Assert.Equal("kg", ProductImportRules.Unit("kilograms"));
    }
}
