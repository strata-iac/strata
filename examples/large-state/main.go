package main

import (
	"fmt"

	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

const resourceCount = 60

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		ids := make([]*random.RandomId, resourceCount)
		for i := range resourceCount {
			var err error
			ids[i], err = random.NewRandomId(ctx, fmt.Sprintf("id-%03d", i), &random.RandomIdArgs{
				ByteLength: pulumi.Int(16),
			})
			if err != nil {
				return err
			}
		}

		pets := make([]*random.RandomPet, 10)
		for i := range 10 {
			var err error
			pets[i], err = random.NewRandomPet(ctx, fmt.Sprintf("pet-%02d", i), &random.RandomPetArgs{
				Length:    pulumi.Int(3),
				Separator: pulumi.String("-"),
				Prefix:    ids[i*6].Hex.ToStringPtrOutput(),
			})
			if err != nil {
				return err
			}
		}

		strings := make([]*random.RandomString, 10)
		for i := range 10 {
			var err error
			strings[i], err = random.NewRandomString(ctx, fmt.Sprintf("str-%02d", i), &random.RandomStringArgs{
				Length:  pulumi.Int(32),
				Special: pulumi.Bool(false),
			}, pulumi.DependsOn([]pulumi.Resource{pets[i]}))
			if err != nil {
				return err
			}
		}

		ctx.Export("totalIds", pulumi.Int(resourceCount))
		ctx.Export("firstId", ids[0].Hex)
		ctx.Export("lastId", ids[resourceCount-1].Hex)
		ctx.Export("firstPet", pets[0].ID())
		ctx.Export("lastString", strings[9].Result)

		return nil
	})
}
