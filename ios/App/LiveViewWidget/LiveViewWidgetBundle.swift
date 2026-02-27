//
//  LiveViewWidgetBundle.swift
//  LiveViewWidget
//
//  Created by Lesley Oredia on 2/24/26.
//

import WidgetKit
import SwiftUI

@main
struct LiveViewWidgetBundle: WidgetBundle {
    var body: some Widget {
        LiveViewWidget()
        LiveViewWidgetLiveActivity()
    }
}
