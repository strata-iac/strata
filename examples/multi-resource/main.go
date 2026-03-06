package main

import (
	"fmt"

	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// Tests: large checkpoint, event batching, dependency graph in state,
// stack outputs (string, int, array), propertyDependencies tracking,
// multiple resource types, explicit DependsOn chains.
func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// Layer 1: Independent base resources (no deps).
		prefix, err := random.NewRandomPet(ctx, "prefix", &random.RandomPetArgs{
			Length: pulumi.Int(2),
		})
		if err != nil {
			return err
		}

		suffix, err := random.NewRandomString(ctx, "suffix", &random.RandomStringArgs{
			Length:  pulumi.Int(8),
			Special: pulumi.Bool(false),
		})
		if err != nil {
			return err
		}

		roll, err := random.NewRandomInteger(ctx, "roll", &random.RandomIntegerArgs{
			Min: pulumi.Int(1),
			Max: pulumi.Int(100),
		})
		if err != nil {
			return err
		}

		// Layer 2: Resources that depend on layer 1 via property inputs.
		// This creates propertyDependencies in the checkpoint.
		tag, err := random.NewRandomId(ctx, "tag", &random.RandomIdArgs{
			ByteLength: pulumi.Int(4),
		}, pulumi.DependsOn([]pulumi.Resource{prefix}))
		if err != nil {
			return err
		}

		// Layer 3: Explicit DependsOn (creates dependencies array in checkpoint).
		uuid, err := random.NewRandomUuid(ctx, "uuid", &random.RandomUuidArgs{},
			pulumi.DependsOn([]pulumi.Resource{tag, suffix}),
		)
		if err != nil {
			return err
		}

		// Layer 4: Multiple resources with shared dependency.
		pets := make([]*random.RandomPet, 5)
		for i := range 5 {
			pets[i], err = random.NewRandomPet(ctx, fmt.Sprintf("pet-%d", i), &random.RandomPetArgs{
				Length:    pulumi.Int(3),
				Separator: pulumi.String("_"),
			}, pulumi.DependsOn([]pulumi.Resource{uuid}))
			if err != nil {
				return err
			}
		}

		// Layer 5: Shuffle that depends on all pets (tests array inputs + deps).
		petIDs := make(pulumi.StringArray, len(pets))
		for i, p := range pets {
			petIDs[i] = p.ID().ToStringOutput()
		}
		shuffled, err := random.NewRandomShuffle(ctx, "shuffled", &random.RandomShuffleArgs{
			Inputs:      petIDs,
			ResultCount: pulumi.Int(3),
		})
		if err != nil {
			return err
		}

		// Stack outputs — tests output serialization in checkpoint.
		ctx.Export("prefixName", prefix.ID())
		ctx.Export("suffixValue", suffix.Result)
		ctx.Export("rollResult", roll.Result)
		ctx.Export("tagHex", tag.Hex)
		ctx.Export("uuidValue", uuid.Result)
		ctx.Export("shuffledTop3", shuffled.Results)
		ctx.Export("totalResources", pulumi.Int(12))

		return nil
	})
}
